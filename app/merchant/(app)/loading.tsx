import { Loader2 } from "lucide-react";

export default function MerchantLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center py-8" role="status" aria-label="Loading">
      <Loader2 size={22} className="animate-spin text-yellow" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
