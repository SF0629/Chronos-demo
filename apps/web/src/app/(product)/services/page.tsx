import { getServices } from "@/lib/chronos-api";
import { getMessages } from "@/lib/locale";
import { getLocale } from "@/lib/server-locale";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function countLabel(count: number, locale: "en" | "ko"): string {
  if (locale === "ko") return `${count} ${count === 1 ? "Service" : "Services"}`;
  return `${count} ${count === 1 ? "service" : "services"}`;
}

export default async function ServicesPage() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  const services = await getServices();

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-zinc-950 dark:text-zinc-50">
              {messages.services.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{messages.services.description}</p>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{countLabel(services.length, locale)}</p>
        </header>

        <section
          aria-label={messages.services.registered}
          className="border-y border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        >
          {services.length > 0 ? (
            <>
              <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(180px,0.75fr)_160px] gap-6 border-b border-zinc-200 bg-zinc-50/70 px-4 py-2 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400 md:grid">
                <span>{messages.common.service}</span>
                <span>{messages.common.prometheusJob}</span>
                <span>{messages.common.updated}</span>
              </div>
              <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {services.map((service) => (
                  <li
                    key={service.id}
                    className="grid gap-3 px-3 py-3.5 sm:px-4 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.75fr)_160px] md:items-center md:gap-6"
                  >
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-50">{service.name}</h2>
                      <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                        {service.description ?? messages.services.noDescription}
                      </p>
                    </div>

                    <div className="min-w-0">
                      <p className="mb-1 text-[11px] text-zinc-400 dark:text-zinc-500 md:hidden">{messages.common.prometheusJob}</p>
                      <code className="block truncate font-mono text-xs text-zinc-700 dark:text-zinc-300">
                        {service.prometheusJob ?? messages.services.notConfigured}
                      </code>
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] text-zinc-400 dark:text-zinc-500 md:hidden">{messages.common.updated}</p>
                      <time dateTime={service.updatedAt} className="text-xs text-zinc-500 dark:text-zinc-400">
                        {formatDate(service.updatedAt)} UTC
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <div className="px-4 py-7">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{messages.services.noServices}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{messages.services.noServicesDescription}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
