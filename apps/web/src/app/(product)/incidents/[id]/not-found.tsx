import Link from "next/link";
import { getMessages } from "@/lib/locale";
import { getLocale } from "@/lib/server-locale";

export default async function NotFound() {
  const locale = await getLocale();
  const messages = getMessages(locale);

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px] border-y border-zinc-200 bg-white px-4 py-7 dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{messages.incident.notFound}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{messages.incident.notFoundDescription}</p>
        <Link
          href="/incidents"
          className="mt-4 inline-block rounded-sm text-sm font-semibold text-zinc-700 hover:text-zinc-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:text-zinc-300 dark:hover:text-zinc-50 dark:focus-visible:ring-zinc-600"
        >
          {messages.incident.backToIncidents}
        </Link>
      </div>
    </main>
  );
}
