"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { canGoBack, readDepth } from "@/lib/nav/back";

// ── A BACK ARROW THAT GOES BACK ─────────────────────────────────────────────
//
// The owner's report: open Orders from the account page, press back, land on
// the homepage. True of thirteen pages, all of which hardcoded href="/" —
// correct for a visitor who arrived from the homepage and wrong for everybody
// else.
//
// ── WHY THIS IS A LINK AND NOT A BUTTON ─────────────────────────────────────
// It was a <button> first, and e2e/navigation.spec.ts caught what that cost:
// "/login has no way out". That page's only internal anchor WAS this control,
// so turning it into a button left the page a dead end by the repo's own
// definition — an invariant written long before this change, and right.
//
// So it is an anchor whose href IS the fallback, and the click is intercepted
// only when there is somewhere better to go. That earns three things a button
// could not:
//
//   · it is a real escape hatch — crawlable, and still a way out with no JS;
//   · middle-click and ctrl-click open the parent, as a link should;
//   · the old `a[href="<parent>"]` assertions keep working, so the invariant
//     that says "back goes one level up" still checks something real.
//
// `fallback` is REQUIRED. Somebody who opened this page from a shared link has
// no in-app history, and router.back() would walk them off the site entirely.
export default function BackLink({
  fallback,
  className = "",
  children,
  showIcon = true,
  iconSize = 14,
}: {
  /** Where to go when this page is the first thing the visitor saw. */
  fallback: string;
  className?: string;
  children?: React.ReactNode;
  showIcon?: boolean;
  iconSize?: number;
}) {
  const router = useRouter();

  return (
    <Link
      href={fallback}
      // Kept alongside the href so a test can tell THIS control from any other
      // link that happens to point at the same place. e2e/navigation.spec.ts
      // matched an unrelated "Browse products" tile on /cart before this.
      data-back-fallback={fallback}
      onClick={(e) => {
        // Leave modified clicks alone: ctrl/cmd/middle-click means "open the
        // parent in a new tab", and hijacking that would be the second time
        // this control took away something a link does for free.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (e.button !== 0) return;
        if (!canGoBack(readDepth())) return; // let the href do its job
        e.preventDefault();
        router.back();
      }}
      className={className}
    >
      {showIcon && <ArrowLeft size={iconSize} />}
      {children}
    </Link>
  );
}
