import Link from "next/link";
import {
  getEvents,
  getIncidents,
  getServices,
  type EventSummary,
  type IncidentSummary,
} from "@/lib/chronos-api";
import { getMessages, type ProductMessages } from "@/lib/locale";
import { getLocale } from "@/lib/server-locale";

function formatDateTime(value: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

function statusBadgeClasses(status: IncidentSummary["status"]): string {
  return status === "open"
    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
    : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function statusLabel(status: IncidentSummary["status"], messages: ProductMessages): string {
  return status === "open" ? messages.common.open : messages.common.resolved;
}

function sourceLabel(source: string, messages: ProductMessages): string {
  if (source === "github") return "GitHub";
  if (source === "docker") return "Docker";
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : messages.common.unknown;
}

function sourceBadgeClasses(source: string): string {
  if (source === "github") {
    return "border-zinc-700 bg-zinc-900 text-white dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
  }
  if (source === "docker") {
    return "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300";
  }
  return "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
}

function IncidentLine({
  incident,
  messages,
  prominent = false,
}: {
  incident: IncidentSummary;
  messages: ProductMessages;
  prominent?: boolean;
}) {
  return (
    <li className="border-b border-zinc-200 last:border-b-0 dark:border-zinc-800">
      <Link
        href={`/incidents/${incident.id}`}
        className={`group grid gap-2 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 dark:hover:bg-zinc-800/60 dark:focus-visible:ring-zinc-600 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 ${
          prominent ? "px-4 py-3.5" : "px-3 py-3"
        }`}
      >
        <span
          className={`w-fit rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClasses(incident.status)}`}
        >
          {statusLabel(incident.status, messages)}
        </span>
        <div className="min-w-0">
          <p
            className={`${prominent ? "text-[15px]" : "text-sm"} truncate font-medium text-zinc-950 group-hover:underline dark:text-zinc-50`}
          >
            {incident.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {incident.serviceName} · {messages.common.started} {formatDateTime(incident.startedAt)}
          </p>
        </div>
        <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-950 dark:text-zinc-400 dark:group-hover:text-zinc-50">
          {messages.common.viewIncident}
        </span>
      </Link>
    </li>
  );
}

function ChangeLine({
  event,
  serviceName,
  messages,
}: {
  event: EventSummary;
  serviceName: string | null;
  messages: ProductMessages;
}) {
  return (
    <li className="border-b border-zinc-200 py-3 last:border-b-0 dark:border-zinc-800">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadgeClasses(event.source)}`}
        >
          {sourceLabel(event.source, messages)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{event.title}</p>
          <div className="mt-1 flex min-w-0 flex-col gap-0.5 text-xs text-zinc-500 dark:text-zinc-400 sm:flex-row sm:items-center sm:gap-1.5">
            <code className="truncate font-mono">{event.type}</code>
            {serviceName ? <span className="truncate">· {serviceName}</span> : null}
            <time dateTime={event.occurredAt} className="sm:hidden">
              {formatDateTime(event.occurredAt)}
            </time>
          </div>
        </div>
        <time
          dateTime={event.occurredAt}
          className="hidden shrink-0 text-xs text-zinc-500 dark:text-zinc-400 sm:block"
        >
          {formatDateTime(event.occurredAt)}
        </time>
      </div>
    </li>
  );
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  const [services, incidents, events] = await Promise.all([
    getServices(),
    getIncidents(),
    getEvents(),
  ]);

  const openIncidents = incidents.filter((incident) => incident.status === "open");
  const serviceNames = new Map(services.map((service) => [service.id, service.name]));
  const recentIncidents = incidents.slice(0, 5);
  const recentChanges = events.slice(0, 6);

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
            {messages.dashboard.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{messages.dashboard.description}</p>
        </header>

        <section
          aria-label={messages.dashboard.overview}
          className="mb-6 grid overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2"
        >
          <dl className="contents">
            <div className="flex items-center justify-between gap-6 px-4 py-3.5 sm:border-r sm:border-zinc-200 sm:dark:border-zinc-800">
              <div>
                <dt className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{messages.dashboard.openIncidents}</dt>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{messages.dashboard.needsInvestigation}</p>
              </div>
              <dd className="text-2xl font-semibold tabular-nums tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
                {openIncidents.length}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-6 border-t border-zinc-200 px-4 py-3.5 dark:border-zinc-800 sm:border-t-0">
              <div>
                <dt className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{messages.product.services}</dt>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{messages.dashboard.registeredWorkloads}</p>
              </div>
              <dd className="text-2xl font-semibold tabular-nums tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
                {services.length}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="needs-attention-heading"
          className="mb-8 overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <div>
              <h2 id="needs-attention-heading" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {messages.dashboard.needsAttention}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{messages.dashboard.needsAttentionDescription}</p>
            </div>
            <Link
              href="/incidents"
              className="rounded-sm text-xs font-medium text-zinc-600 hover:text-zinc-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-600"
            >
              {messages.common.allIncidents}
            </Link>
          </div>
          {openIncidents.length > 0 ? (
            <ol>
              {openIncidents.slice(0, 3).map((incident) => (
                <IncidentLine key={incident.id} incident={incident} messages={messages} prominent />
              ))}
            </ol>
          ) : (
            <div className="px-4 py-4">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{messages.dashboard.noOpenIncidents}</p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{messages.dashboard.noOpenIncidentsDescription}</p>
            </div>
          )}
        </section>

        <div className="grid gap-8 xl:grid-cols-2">
          <section aria-labelledby="recent-incidents-heading" className="min-w-0">
            <div className="flex items-end justify-between gap-4 border-b border-zinc-300 pb-2.5 dark:border-zinc-700">
              <div>
                <h2 id="recent-incidents-heading" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                  {messages.dashboard.recentIncidents}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{messages.dashboard.recentIncidentsDescription}</p>
              </div>
            </div>
            {recentIncidents.length > 0 ? (
              <ol>
                {recentIncidents.map((incident) => (
                  <IncidentLine key={incident.id} incident={incident} messages={messages} />
                ))}
              </ol>
            ) : (
              <p className="py-5 text-sm text-zinc-500 dark:text-zinc-400">{messages.dashboard.noIncidents}</p>
            )}
          </section>

          <section aria-labelledby="recent-changes-heading" className="min-w-0">
            <div className="border-b border-zinc-300 pb-2.5 dark:border-zinc-700">
              <h2 id="recent-changes-heading" className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {messages.dashboard.recentChanges}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{messages.dashboard.recentChangesDescription}</p>
            </div>
            {recentChanges.length > 0 ? (
              <ol>
                {recentChanges.map((event) => (
                  <ChangeLine
                    key={event.id}
                    event={event}
                    serviceName={serviceNames.get(event.serviceId) ?? null}
                    messages={messages}
                  />
                ))}
              </ol>
            ) : (
              <p className="py-5 text-sm text-zinc-500 dark:text-zinc-400">{messages.dashboard.noEvents}</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
