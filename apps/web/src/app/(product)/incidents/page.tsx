import Link from "next/link";
import { getIncidents, type IncidentSummary } from "@/lib/chronos-api";
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

function triggerLabel(triggerType: string, messages: ProductMessages): string {
  return triggerType === "manual" ? messages.common.manual : triggerType || messages.common.unknown;
}

function countLabel(count: number, locale: "en" | "ko"): string {
  if (locale === "ko") return `${count} ${count === 1 ? "Incident" : "Incidents"}`;
  return `${count} ${count === 1 ? "incident" : "incidents"}`;
}

export default async function IncidentsPage() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  const incidents = await getIncidents();

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {messages.incidents.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{messages.incidents.description}</p>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{countLabel(incidents.length, locale)}</p>
        </header>

        <section
          aria-label={messages.incidents.queue}
          className="border-y border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          {incidents.length > 0 ? (
            <>
              <div className="hidden grid-cols-[96px_minmax(0,1.35fr)_minmax(150px,0.8fr)_minmax(180px,0.9fr)_80px] gap-4 border-b border-zinc-200 bg-zinc-50/70 px-4 py-2 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400 md:grid">
                <span>{messages.common.status}</span>
                <span>{messages.incidents.incident}</span>
                <span>{messages.common.service}</span>
                <span>{messages.common.started}</span>
                <span className="text-right">{messages.common.trigger}</span>
              </div>
              <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {incidents.map((incident) => (
                  <li key={incident.id}>
                    <Link
                      href={`/incidents/${incident.id}`}
                      className="group grid gap-3 px-3 py-3.5 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 dark:hover:bg-zinc-800/50 dark:focus-visible:ring-zinc-600 sm:px-4 md:grid-cols-[96px_minmax(0,1.35fr)_minmax(150px,0.8fr)_minmax(180px,0.9fr)_80px] md:items-center md:gap-4"
                    >
                      <span
                        className={`w-fit rounded border px-1.5 py-0.5 text-[10px] font-semibold ${statusBadgeClasses(incident.status)}`}
                      >
                        {statusLabel(incident.status, messages)}
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-zinc-950 group-hover:underline dark:text-zinc-50">
                          {incident.title}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 md:hidden">{incident.serviceName}</p>
                        {incident.resolvedAt ? (
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {messages.common.resolvedLabel}{" "}
                            <time dateTime={incident.resolvedAt}>{formatDateTime(incident.resolvedAt)}</time>
                          </p>
                        ) : null}
                      </div>

                      <p className="hidden truncate text-sm text-zinc-600 dark:text-zinc-300 md:block">{incident.serviceName}</p>

                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="md:hidden">{messages.common.started} </span>
                        <time dateTime={incident.startedAt}>{formatDateTime(incident.startedAt)}</time>
                      </div>

                      <div className="flex items-center justify-between gap-3 md:block md:text-right">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {triggerLabel(incident.triggerType, messages)}
                        </span>
                        <span className="text-xs font-medium text-zinc-500 group-hover:text-zinc-950 dark:text-zinc-400 dark:group-hover:text-zinc-50 md:hidden">
                          {messages.common.view} →
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="px-4 py-7">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{messages.incidents.noIncidents}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{messages.incidents.noIncidentsDescription}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
