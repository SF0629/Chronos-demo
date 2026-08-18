import { Fragment, type ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  getIncidentCorrelation,
  getIncidentDetail,
  getMetricSummary,
  type CorrelatedEvent,
  type HttpLatencyMetricSummary,
  type IncidentCorrelation,
  type IncidentDetail,
} from "@/lib/chronos-api";

const METRIC_WINDOW_SECONDS = 60;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value)) + " UTC";
}

function formatDuration(startedAt: string, resolvedAt: string): string {
  const durationSeconds = Math.max(
    0,
    Math.round(
      (new Date(resolvedAt).getTime() - new Date(startedAt).getTime()) / 1000,
    ),
  );

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatRelativeSeconds(deltaSeconds: number): string {
  if (deltaSeconds < 60) {
    const seconds = Number(deltaSeconds.toFixed(1));
    return `${seconds}s`;
  }

  const minutes = Number((deltaSeconds / 60).toFixed(1));
  return `${minutes}m`;
}

function sourceLabel(source: string): string {
  if (source === "github") {
    return "GitHub";
  }

  if (source === "docker") {
    return "Docker";
  }

  if (!source) {
    return "Unknown";
  }

  return source.charAt(0).toUpperCase() + source.slice(1);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-zinc-200 px-6 py-8 sm:px-10">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function IncidentSummary({ incident }: { incident: IncidentDetail }) {
  const resolvedAt = incident.resolvedAt;

  return (
    <header className="px-6 py-9 sm:px-10">
      <p className="text-sm font-medium text-zinc-500">Incident</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">
            {incident.title}
          </h1>
          <p className="mt-2 text-base text-zinc-600">{incident.serviceName}</p>
        </div>
        <span className="w-fit rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-700">
          {incident.status}
        </span>
      </div>

      <dl className="mt-7 grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-zinc-500">Started</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {formatDateTime(incident.startedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Resolved</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {incident.resolvedAt ? formatDateTime(incident.resolvedAt) : "Ongoing"}
          </dd>
        </div>
        <div>
          <dt className="text-zinc-500">Duration</dt>
          <dd className="mt-1 font-medium text-zinc-900">
            {resolvedAt
              ? formatDuration(incident.startedAt, resolvedAt)
              : "Ongoing"}
          </dd>
        </div>
      </dl>
    </header>
  );
}

function RelatedChanges({
  correlation,
  failed,
}: {
  correlation: IncidentCorrelation | null;
  failed: boolean;
}) {
  if (failed) {
    return <p className="text-sm text-zinc-600">Unable to load related changes.</p>;
  }

  if (!correlation || correlation.relatedEvents.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        No related changes found in the incident window.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-zinc-500">
        Relevance score, not root cause probability.
      </p>
      <ol className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200">
        {correlation.relatedEvents.map((item) => (
          <li key={item.event.id} className="py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
                  <span>{sourceLabel(item.event.source)}</span>
                  <span aria-hidden="true">·</span>
                  <code>{item.event.type}</code>
                </div>
                <p className="mt-2 font-medium text-zinc-950">
                  {item.event.title}
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {formatDateTime(item.event.occurred_at)} ·{" "}
                  {formatRelativeSeconds(item.deltaSeconds)} {item.position}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-zinc-800">
                Relevance {Math.round(item.score * 100)}/100
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatMilliseconds(seconds: number): number {
  const value = Math.round(seconds * 1000);
  return Object.is(value, -0) ? 0 : value;
}

function metricObservation(before: number, after: number): string {
  if (after > before) {
    return "Latency increased after the incident boundary.";
  }

  if (after < before) {
    return "Latency decreased after the incident boundary.";
  }

  return "Latency was unchanged across the incident boundary.";
}

function MetricSummary({
  summary,
  failed,
}: {
  summary: HttpLatencyMetricSummary | null;
  failed: boolean;
}) {
  if (failed || !summary) {
    return (
      <p className="text-sm text-zinc-600">
        Metric summary is unavailable for this incident window.
      </p>
    );
  }

  const beforeMs = formatMilliseconds(summary.before.averageLatency);
  const afterMs = formatMilliseconds(summary.after.averageLatency);
  const changeMs = formatMilliseconds(
    summary.after.averageLatency - summary.before.averageLatency,
  );

  return (
    <div>
      <p className="text-sm font-medium text-zinc-500">Average HTTP Latency</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Before
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {beforeMs} ms
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            After
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {afterMs} ms
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Change
          </p>
          <p className="mt-2 text-2xl font-semibold text-zinc-950">
            {changeMs > 0 ? "+" : ""}{changeMs} ms
          </p>
        </div>
      </div>
      <p className="mt-4 text-sm text-zinc-600">
        {metricObservation(
          summary.before.averageLatency,
          summary.after.averageLatency,
        )}
      </p>
    </div>
  );
}

function TimelineItem({ item }: { item: CorrelatedEvent }) {
  return (
    <li className="grid gap-1 py-4 sm:grid-cols-[190px_1fr] sm:gap-5">
      <time className="text-sm text-zinc-500">
        {formatDateTime(item.event.occurred_at)}
      </time>
      <div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500">
          <span>{sourceLabel(item.event.source)}</span>
          <span aria-hidden="true">·</span>
          <code>{item.event.type}</code>
        </div>
        <p className="mt-1 text-sm font-medium text-zinc-900">
          {item.event.title}
        </p>
      </div>
    </li>
  );
}

function IncidentBoundary({ startedAt }: { startedAt: string }) {
  return (
    <li className="flex items-center gap-3 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
      <span className="h-px flex-1 bg-zinc-300" />
      <span>Incident started · {formatDateTime(startedAt)}</span>
      <span className="h-px flex-1 bg-zinc-300" />
    </li>
  );
}

function Timeline({
  correlation,
  incidentStartedAt,
  failed,
}: {
  correlation: IncidentCorrelation | null;
  incidentStartedAt: string;
  failed: boolean;
}) {
  if (failed) {
    return <p className="text-sm text-zinc-600">Unable to load incident timeline.</p>;
  }

  if (!correlation || correlation.timeline.length === 0) {
    return (
      <p className="text-sm text-zinc-600">
        No events found in the incident window.
      </p>
    );
  }

  const incidentTime = new Date(incidentStartedAt).getTime();
  const firstAfterIndex = correlation.timeline.findIndex(
    (item) => new Date(item.event.occurred_at).getTime() > incidentTime,
  );

  return (
    <ol className="divide-y divide-zinc-200 border-y border-zinc-200">
      {correlation.timeline.map((item, index) => (
        <Fragment key={item.event.id}>
          {index === firstAfterIndex ? (
            <IncidentBoundary startedAt={incidentStartedAt} />
          ) : null}
          <TimelineItem item={item} />
        </Fragment>
      ))}
      {firstAfterIndex === -1 ? (
        <IncidentBoundary startedAt={incidentStartedAt} />
      ) : null}
    </ol>
  );
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incident = await getIncidentDetail(id);

  if (!incident) {
    notFound();
  }

  const incidentAt = new Date(incident.startedAt).getTime() / 1000;
  const [correlationResult, metricResult] = await Promise.allSettled([
    getIncidentCorrelation(id),
    getMetricSummary(incidentAt, METRIC_WINDOW_SECONDS),
  ]);

  const correlation =
    correlationResult.status === "fulfilled" ? correlationResult.value : null;
  const metricSummary =
    metricResult.status === "fulfilled" ? metricResult.value : null;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4 sm:px-10">
          <span className="text-sm font-semibold tracking-tight">Chronos</span>
        </div>

        <IncidentSummary incident={incident} />

        <Section title="Related Changes">
          <RelatedChanges
            correlation={correlation}
            failed={correlationResult.status === "rejected"}
          />
        </Section>

        <Section title="Metric Summary">
          <MetricSummary
            summary={metricSummary}
            failed={metricResult.status === "rejected"}
          />
        </Section>

        <Section title="Timeline">
          <Timeline
            correlation={correlation}
            incidentStartedAt={incident.startedAt}
            failed={correlationResult.status === "rejected"}
          />
        </Section>
      </div>
    </main>
  );
}
