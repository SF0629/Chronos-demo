import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IncidentToc } from "./_components/incident-toc";
import {
    getIncidentCorrelation,
    getIncidentDetail,
    getIncidentMetricSummary,
    type CorrelatedEvent,
    type HttpLatencyMetricSummary,
    type IncidentCorrelation,
    type IncidentDetail,
} from "@/lib/chronos-api";
import { getMessages, type Locale, type ProductMessages } from "@/lib/locale";
import { getLocale } from "@/lib/server-locale";

const METRIC_WINDOW_SECONDS = 60;

function formatDateTime(value: string): string {
    return (
        new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: "UTC",
        }).format(new Date(value)) + " UTC"
    );
}

function formatDuration(startedAt: string, resolvedAt: string): string {
    const durationSeconds = Math.max(
        0,
        Math.round(
            (new Date(resolvedAt).getTime() - new Date(startedAt).getTime()) /
                1000,
        ),
    );

    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = durationSeconds % 60;

    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function formatRelativeSeconds(deltaSeconds: number, locale: Locale): string {
    if (deltaSeconds < 60) {
        const seconds = Number(deltaSeconds.toFixed(1));
        return locale === "ko" ? `${seconds}초` : `${seconds}s`;
    }

    const minutes = Number((deltaSeconds / 60).toFixed(1));
    return locale === "ko" ? `${minutes}분` : `${minutes}m`;
}

function sourceLabel(source: string, messages: ProductMessages): string {
    if (source === "github") return "GitHub";
    if (source === "docker") return "Docker";
    if (!source) return messages.common.unknown;
    return source.charAt(0).toUpperCase() + source.slice(1);
}

function sourceBadgeClasses(source: string): string {
    if (source === "github") {
        return "border-zinc-300 bg-zinc-950 text-white dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
    }

    if (source === "docker") {
        return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300";
    }

    return "border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function statusBadgeClasses(status: IncidentDetail["status"]): string {
    if (status === "open") {
        return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
    }

    return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";
}

function statusLabel(
    status: IncidentDetail["status"],
    messages: ProductMessages,
): string {
    return status === "open" ? messages.common.open : messages.common.resolved;
}

function triggerLabel(triggerType: string, messages: ProductMessages): string {
    if (triggerType === "manual") return messages.incident.manualIncident;
    if (!triggerType) return messages.common.unknown;
    return triggerType;
}

function Section({
    id,
    title,
    description,
    children,
}: {
    id: string;
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <section
            id={id}
            className="scroll-mt-20 border-t border-zinc-200 pt-6 dark:border-zinc-800"
        >
            <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                    {title}
                </h2>
                <p className="mt-1 text-sm leading-5 text-zinc-500 dark:text-zinc-400">
                    {description}
                </p>
            </div>
            {children}
        </section>
    );
}

function IncidentSummary({
    incident,
    messages,
}: {
    incident: IncidentDetail;
    messages: ProductMessages;
}) {
    const resolvedAt = incident.resolvedAt;

    return (
        <section
            id="summary"
            aria-labelledby="incident-title"
            className="scroll-mt-20 border-b border-zinc-200 pb-6 dark:border-zinc-800"
        >
            <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <h1
                        id="incident-title"
                        className="max-w-4xl text-2xl font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50 sm:text-3xl"
                    >
                        {incident.title}
                    </h1>
                    <p className="mt-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                        {incident.serviceName}
                    </p>
                </div>
                <span
                    className={`w-fit shrink-0 rounded border px-2 py-1 text-xs font-semibold ${statusBadgeClasses(incident.status)}`}
                >
                    {statusLabel(incident.status, messages)}
                </span>
            </header>

            <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                        {messages.common.started}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        <time dateTime={incident.startedAt}>
                            {formatDateTime(incident.startedAt)}
                        </time>
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                        {messages.common.resolvedLabel}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {incident.resolvedAt ? (
                            <time dateTime={incident.resolvedAt}>
                                {formatDateTime(incident.resolvedAt)}
                            </time>
                        ) : (
                            messages.common.ongoing
                        )}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                        {messages.common.duration}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {resolvedAt
                            ? formatDuration(incident.startedAt, resolvedAt)
                            : messages.common.ongoing}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                        {messages.common.trigger}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {triggerLabel(incident.triggerType, messages)}
                    </dd>
                </div>
            </dl>
        </section>
    );
}

function RelatedChanges({
    correlation,
    failed,
    locale,
    messages,
}: {
    correlation: IncidentCorrelation | null;
    failed: boolean;
    locale: Locale;
    messages: ProductMessages;
}) {
    if (failed) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {messages.incident.unableRelated}
            </p>
        );
    }

    if (!correlation || correlation.relatedEvents.length === 0) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {messages.incident.noRelated}
            </p>
        );
    }

    return (
        <div>
            <div className="mb-2 flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
                <p>{messages.incident.relevantEvents}</p>
                <p className="font-medium">
                    {messages.incident.relevanceDisclaimer}
                </p>
            </div>
            <ol className="divide-y divide-zinc-200 border-y border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                {correlation.relatedEvents.map((item) => {
                    const relativeTime = formatRelativeSeconds(
                        item.deltaSeconds,
                        locale,
                    );
                    const positionLabel =
                        locale === "ko"
                            ? `Incident ${relativeTime} ${item.position === "before" ? "전" : "후"}`
                            : `${relativeTime} ${item.position === "before" ? messages.incident.beforeIncident : messages.incident.afterIncident}`;

                    return (
                        <li
                            key={item.event.id}
                            className="grid gap-2 px-3 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-5"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span
                                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadgeClasses(item.event.source)}`}
                                    >
                                        {sourceLabel(
                                            item.event.source,
                                            messages,
                                        )}
                                    </span>
                                    <code className="break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                        {item.event.type}
                                    </code>
                                </div>
                                <p className="mt-1.5 break-words text-sm font-medium text-zinc-950 dark:text-zinc-50">
                                    {item.event.title}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                                    <time dateTime={item.event.occurred_at}>
                                        {formatDateTime(item.event.occurred_at)}
                                    </time>{" "}
                                    ·{" "}
                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                        {positionLabel}
                                    </span>
                                </p>
                            </div>
                            <div className="text-left sm:min-w-24 sm:text-right">
                                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                    {messages.incident.relevance}
                                </p>
                                <p className="text-lg font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                                    {Math.round(item.score * 100)}
                                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                                        /100
                                    </span>
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

function formatMilliseconds(seconds: number): number {
    const value = Math.round(seconds * 1000);
    return Object.is(value, -0) ? 0 : value;
}

function metricObservation(
    before: number,
    after: number,
    messages: ProductMessages,
): string {
    if (after > before) return messages.incident.latencyIncreased;
    if (after < before) return messages.incident.latencyDecreased;
    return messages.incident.latencyUnchanged;
}

function requestCountLabel(
    count: number,
    locale: Locale,
    messages: ProductMessages,
): string {
    return locale === "ko"
        ? `${count} ${messages.incident.observedRequests}`
        : `${count} ${messages.incident.observedRequests}`;
}

function MetricSummary({
    summary,
    failed,
    locale,
    messages,
}: {
    summary: HttpLatencyMetricSummary | null;
    failed: boolean;
    locale: Locale;
    messages: ProductMessages;
}) {
    if (failed || !summary) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {messages.incident.metricUnavailable}
            </p>
        );
    }

    const beforeMs = formatMilliseconds(summary.before.averageLatency);
    const afterMs = formatMilliseconds(summary.after.averageLatency);
    const changeMs = formatMilliseconds(
        summary.after.averageLatency - summary.before.averageLatency,
    );
    const ratio =
        summary.before.averageLatency > 0 &&
        Number.isFinite(
            summary.after.averageLatency / summary.before.averageLatency,
        )
            ? summary.after.averageLatency / summary.before.averageLatency
            : null;
    const increased =
        summary.after.averageLatency > summary.before.averageLatency;
    const decreased =
        summary.after.averageLatency < summary.before.averageLatency;
    const ratioText =
        ratio !== null && increased
            ? ` · ${ratio.toFixed(1)}× ${messages.incident.higher}`
            : "";

    return (
        <div>
            <div className="border-y border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <div className="px-6 pb-6 pt-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                    <div>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                            {messages.incident.observedMetric}
                        </p>
                        <p className="mt-2.5 text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                            {messages.incident.averageHttpLatency}
                        </p>
                    </div>
                    <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                        {locale === "ko"
                            ? `Incident 전 / 후 ${METRIC_WINDOW_SECONDS}초`
                            : `${METRIC_WINDOW_SECONDS}s before / after incident`}
                    </p>
                </div>
      </div>

      <div className="grid border border-zinc-200 dark:border-zinc-800 md:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_minmax(0,0.85fr)] md:items-stretch">
                    <div className="p-4">
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {messages.incident.before}
                        </p>
                        <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
                            {beforeMs}
                            <span className="ml-1.5 text-base font-medium tracking-normal text-zinc-500 dark:text-zinc-400">
                                ms
                            </span>
                        </p>
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {requestCountLabel(
                                summary.before.requestCount,
                                locale,
                                messages,
                            )}
                        </p>
                    </div>

                    <div
                        aria-hidden="true"
                        className="hidden items-center justify-center text-2xl text-zinc-300 dark:text-zinc-700 md:flex"
                    >
                        →
                    </div>

                    <div className="border-t border-zinc-200 p-4 dark:border-zinc-800 md:border-l md:border-t-0">
                        <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {messages.incident.after}
                        </p>
                        <p className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-zinc-950 dark:text-zinc-50">
                            {afterMs}
                            <span className="ml-1.5 text-base font-medium tracking-normal text-zinc-500 dark:text-zinc-400">
                                ms
                            </span>
                        </p>
                        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {requestCountLabel(
                                summary.after.requestCount,
                                locale,
                                messages,
                            )}
                        </p>
                    </div>

                    <div className="border-t border-zinc-200 bg-zinc-950 p-4 text-white dark:border-zinc-700 dark:bg-zinc-950 md:border-l md:border-t-0">
                        <p className="text-xs font-semibold text-zinc-400">
                            {messages.incident.observedChange}
                        </p>
                        <p className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
                            {changeMs > 0 ? "+" : ""}
                            {changeMs}
                            <span className="ml-1.5 text-base font-medium tracking-normal text-zinc-400">
                                ms
                            </span>
                        </p>
                        <p className="mt-2 text-xs font-medium text-zinc-300">
                            {increased
                                ? messages.incident.increase
                                : decreased
                                  ? messages.incident.decrease
                                  : messages.incident.unchanged}
                            {ratioText}
                        </p>
                    </div>
                </div>
            </div>

            <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {metricObservation(
                    summary.before.averageLatency,
                    summary.after.averageLatency,
                    messages,
                )}
            </p>
        </div>
    );
}

function TimelineItem({
    item,
    messages,
}: {
    item: CorrelatedEvent;
    messages: ProductMessages;
}) {
    return (
        <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[190px_32px_minmax(0,1fr)] sm:gap-x-4">
            <time
                dateTime={item.event.occurred_at}
                className="hidden pt-3 text-right text-xs leading-5 text-zinc-500 dark:text-zinc-400 sm:block"
            >
                {formatDateTime(item.event.occurred_at)}
            </time>

            <div className="relative flex justify-center" aria-hidden="true">
                <span className="absolute inset-y-0 w-px bg-zinc-200 dark:bg-zinc-800" />
                <span className="relative mt-4 h-2.5 w-2.5 rounded-full border-2 border-white bg-zinc-400 ring-1 ring-zinc-300 dark:border-zinc-900 dark:bg-zinc-500 dark:ring-zinc-700" />
            </div>

            <div className="min-w-0 py-3">
                <time
                    dateTime={item.event.occurred_at}
                    className="text-xs leading-5 text-zinc-500 dark:text-zinc-400 sm:hidden"
                >
                    {formatDateTime(item.event.occurred_at)}
                </time>
                <div className="mt-1 flex flex-wrap items-center gap-2 sm:mt-0">
                    <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${sourceBadgeClasses(item.event.source)}`}
                    >
                        {sourceLabel(item.event.source, messages)}
                    </span>
                    <code className="break-all text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        {item.event.type}
                    </code>
                </div>
                <p className="mt-1.5 break-words text-sm font-medium leading-5 text-zinc-900 dark:text-zinc-100">
                    {item.event.title}
                </p>
            </div>
        </li>
    );
}

function IncidentBoundary({
    startedAt,
    messages,
}: {
    startedAt: string;
    messages: ProductMessages;
}) {
    return (
        <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[190px_32px_minmax(0,1fr)] sm:gap-x-4">
            <time
                dateTime={startedAt}
                className="hidden py-3 text-right text-xs font-semibold leading-5 text-amber-700 dark:text-amber-300 sm:block"
            >
                {formatDateTime(startedAt)}
            </time>

            <div className="relative flex justify-center" aria-hidden="true">
                <span className="absolute inset-y-0 w-px bg-zinc-200 dark:bg-zinc-800" />
                <span className="relative mt-4 h-3 w-3 rounded-full border-2 border-white bg-amber-500 ring-2 ring-amber-100 dark:border-zinc-900 dark:ring-amber-900" />
            </div>

            <div className="py-2.5">
                <div className="border-y border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                    <span className="font-semibold">
                        {messages.incident.incidentStarted}
                    </span>
                    <time
                        dateTime={startedAt}
                        className="mt-0.5 block text-xs text-amber-700 dark:text-amber-300 sm:hidden"
                    >
                        {formatDateTime(startedAt)}
                    </time>
                </div>
            </div>
        </li>
    );
}

function Timeline({
    correlation,
    incidentStartedAt,
    failed,
    messages,
}: {
    correlation: IncidentCorrelation | null;
    incidentStartedAt: string;
    failed: boolean;
    messages: ProductMessages;
}) {
    if (failed) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {messages.incident.unableTimeline}
            </p>
        );
    }

    if (!correlation || correlation.timeline.length === 0) {
        return (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {messages.incident.noTimeline}
            </p>
        );
    }

    const incidentTime = new Date(incidentStartedAt).getTime();
    const firstAfterIndex = correlation.timeline.findIndex(
        (item) => new Date(item.event.occurred_at).getTime() > incidentTime,
    );

    return (
        <ol className="border-y border-zinc-200 bg-white px-2 dark:border-zinc-800 dark:bg-zinc-900 sm:px-3">
            {correlation.timeline.map((item, index) => (
                <Fragment key={item.event.id}>
                    {index === firstAfterIndex ? (
                        <IncidentBoundary
                            startedAt={incidentStartedAt}
                            messages={messages}
                        />
                    ) : null}
                    <TimelineItem item={item} messages={messages} />
                </Fragment>
            ))}
            {firstAfterIndex === -1 ? (
                <IncidentBoundary
                    startedAt={incidentStartedAt}
                    messages={messages}
                />
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
    const locale = await getLocale();
    const messages = getMessages(locale);
    const incident = await getIncidentDetail(id);

    const tocLabels = {
        ariaLabel: messages.incident.sectionsNavigation,
        summary: messages.incident.summary,
        relatedChanges: messages.incident.relatedChanges,
        metricSummary: messages.incident.metricSummary,
        timeline: messages.incident.timeline,
        changesShort: messages.incident.changesShort,
        metricsShort: messages.incident.metricsShort,
        onThisIncident: messages.incident.onThisIncident,
        incidentSections: messages.incident.incidentSections,
    };

    if (!incident) notFound();

    const [correlationResult, metricResult] = await Promise.allSettled([
        getIncidentCorrelation(id),
        getIncidentMetricSummary(id, METRIC_WINDOW_SECONDS),
    ]);

    const correlation =
        correlationResult.status === "fulfilled"
            ? correlationResult.value
            : null;
    const metricSummary =
        metricResult.status === "fulfilled" ? metricResult.value : null;

    return (
        <main className="px-4 py-7 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-[1500px]">
                <div className="xl:grid xl:grid-cols-[180px_minmax(0,1fr)] xl:gap-9">
                    <aside
                        className="relative hidden xl:block"
                        aria-label={messages.incident.contextNavigation}
                    >
                        <IncidentToc labels={tocLabels} />
                    </aside>

                    <div className="min-w-0">
                        <header className="mb-4 flex items-center justify-between gap-4">
                            <p className="text-sm text-zinc-500 dark:text-zinc-400">
                                {messages.incident.analysis}
                            </p>
                            <Link
                                href="/incidents"
                                className="rounded-sm text-sm font-medium text-zinc-600 hover:text-zinc-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-400 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-600"
                            >
                                {messages.incident.backToIncidents}
                            </Link>
                        </header>

                        <IncidentToc labels={tocLabels} compact />

                        <div className="mt-6 min-w-0 space-y-8">
                            <IncidentSummary
                                incident={incident}
                                messages={messages}
                            />

                            <Section
                                id="related-changes"
                                title={messages.incident.relatedChanges}
                                description={
                                    messages.incident.relatedDescription
                                }
                            >
                                <RelatedChanges
                                    correlation={correlation}
                                    failed={
                                        correlationResult.status === "rejected"
                                    }
                                    locale={locale}
                                    messages={messages}
                                />
                            </Section>

                            <Section
                                id="metric-summary"
                                title={messages.incident.metricSummary}
                                description={
                                    messages.incident.metricDescription
                                }
                            >
                                <MetricSummary
                                    summary={metricSummary}
                                    failed={metricResult.status === "rejected"}
                                    locale={locale}
                                    messages={messages}
                                />
                            </Section>

                            <Section
                                id="timeline"
                                title={messages.incident.timeline}
                                description={
                                    messages.incident.timelineDescription
                                }
                            >
                                <Timeline
                                    correlation={correlation}
                                    incidentStartedAt={incident.startedAt}
                                    failed={
                                        correlationResult.status === "rejected"
                                    }
                                    messages={messages}
                                />
                            </Section>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
