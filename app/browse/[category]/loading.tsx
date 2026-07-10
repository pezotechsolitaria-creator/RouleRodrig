// Instant loading UI for the /browse pages. Next renders this the moment a hub
// tile is tapped — so there's immediate feedback and no "did my tap register?"
// confusion, while the real (live-availability) page streams in behind it.
export default function BrowseLoading() {
  return (
    <div className="min-h-screen bg-dark">
      {/* Faux navbar (matches the real one's position so there's no flash) */}
      <div className="fixed top-0 inset-x-0 z-50 bg-dark/80 backdrop-blur-xl border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="h-9 w-24 rounded-lg bg-white/5 animate-pulse" />
          <div className="flex gap-3">
            <div className="h-6 w-6 rounded-full bg-white/5 animate-pulse" />
            <div className="h-6 w-6 rounded bg-white/5 animate-pulse" />
          </div>
        </div>
      </div>

      {/* Back bar */}
      <div className="max-w-7xl mx-auto px-6 pt-28 md:pt-32 pb-1">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-white/5 animate-pulse" />
          <div className="h-4 w-52 rounded bg-white/5 animate-pulse" />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/5 mt-3">
        <div className="max-w-7xl mx-auto px-6 py-3 flex gap-2.5">
          {[96, 84, 128].map((w, i) => (
            <div key={i} className="h-10 rounded-full bg-white/5 animate-pulse" style={{ width: w }} />
          ))}
        </div>
      </div>

      {/* Header + card grid */}
      <div className="max-w-7xl mx-auto px-6 py-14 md:py-20">
        <div className="h-3 w-24 rounded bg-yellow/20 animate-pulse mb-4" />
        <div className="h-14 w-64 rounded-lg bg-white/5 animate-pulse mb-3" />
        <div className="h-4 w-80 max-w-[80%] rounded bg-white/5 animate-pulse mb-12" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map((i) => (
            <div key={i} className="bg-dark-card rounded-2xl border border-dark-border overflow-hidden">
              <div className="h-[320px] md:h-[420px] bg-white/5 animate-pulse" />
              <div className="p-6 md:p-8 space-y-4">
                <div className="h-3 w-28 bg-white/5 rounded animate-pulse" />
                <div className="h-9 w-48 bg-white/5 rounded animate-pulse" />
                <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-white/5 rounded animate-pulse" />
                <div className="flex gap-3 pt-4">
                  <div className="h-11 w-24 bg-white/5 rounded-full animate-pulse" />
                  <div className="h-11 flex-1 bg-yellow/20 rounded-full animate-pulse" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
