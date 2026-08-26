import { getMessages } from "@/lib/locale";
import { getLocale } from "@/lib/server-locale";

export default async function Loading() {
  const locale = await getLocale();
  const messages = getMessages(locale);

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1500px] border-y border-zinc-200 bg-white px-4 py-7 dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{messages.incident.loading}</p>
      </div>
    </main>
  );
}
