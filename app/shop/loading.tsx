// Skeleton for the /shop directory — the page is force-dynamic (live
// open/closed verdicts), so every visit pays a server round trip and this is
// what the visitor sees during it. Mirrors the real layout: header, search
// bar, chip row, card grid.
export default function ShopDirectoryLoading() {
  return (
    <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
      <div className="mx-auto max-w-4xl animate-pulse">
        <div className="h-3 w-28 rounded bg-white/10" />
        <div className="mt-2 h-8 w-64 rounded bg-white/10" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-white/5" />
        <div className="mt-5 h-12 rounded-2xl bg-white/5" />
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-24 rounded-full bg-white/5" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-dark-card">
              <div className="aspect-[16/8] w-full bg-white/5" />
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/10" />
                  <div className="flex-1">
                    <div className="h-4 w-2/3 rounded bg-white/10" />
                    <div className="mt-1.5 h-3 w-1/2 rounded bg-white/5" />
                  </div>
                </div>
                <div className="mt-4 flex gap-1.5">
                  <div className="h-5 w-14 rounded-full bg-white/5" />
                  <div className="h-5 w-16 rounded-full bg-white/5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
