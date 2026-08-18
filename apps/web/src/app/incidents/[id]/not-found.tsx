export default function NotFound() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-950 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-4xl rounded-xl border border-zinc-200 bg-white px-6 py-10 shadow-sm sm:px-10">
        <p className="text-sm font-medium text-zinc-500">Incident</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Incident not found
        </h1>
        <p className="mt-3 text-sm text-zinc-600">
          The requested incident does not exist.
        </p>
      </div>
    </main>
  );
}
