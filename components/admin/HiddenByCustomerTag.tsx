import { EyeOff } from "lucide-react";

// ── "Hidden by customer" (M228) ─────────────────────────────────────────────
//
// A customer can clear a request from their own list on /deliver (M227). The
// desk keeps seeing it — that is the point — but has to know the customer
// stopped watching: an open request they hid is still collecting prices
// nobody will look at, and a phone call is worth more than another quote.
//
// Renders nothing when the request is not hidden, so callers can pass the
// field straight through.

export default function HiddenByCustomerTag({ at, className = "" }: { at: string | null | undefined; className?: string }) {
  if (!at) return null;
  const when = new Date(at).toLocaleString("en-GB", {
    timeZone: "Indian/Mauritius",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <span
      title={`The customer cleared this from their own list on ${when}. It is unchanged everywhere else.`}
      className={`inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 font-dm text-[11px] font-semibold tracking-normal text-sky-200 ${className}`}
    >
      <EyeOff size={11} aria-hidden />
      Hidden by customer · {when}
    </span>
  );
}
