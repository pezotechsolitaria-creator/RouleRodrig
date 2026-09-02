"use client";

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
// `fallback` is REQUIRED and is not a nicety: somebody who opened this page
// from a shared link or a search result has no in-app history, and calling
// back() would walk them off the site. That visitor gets the page's declared
// parent instead, which is what the old hardcoded link was trying to be.
//
// The visual is the caller's. This takes className and children so each page
// keeps the arrow, label and spacing it already had — the destination changes,
// not the design.
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
    <button
      type="button"
      // ── THE INVARIANT HAS TO STAY TESTABLE ──────────────────────────────
      // e2e/navigation.spec.ts asserts "back goes one level up" by looking for
      // an anchor carrying the parent's href. A button has no href, so the
      // moment a page converted to BackLink that assertion either failed or,
      // worse, passed because some unrelated link on the page happened to
      // point at the same place. Declaring the fallback here keeps the rule
      // checkable and keeps it honest about WHICH control it is checking.
      data-back-fallback={fallback}
      onClick={() => {
        if (canGoBack(readDepth())) router.back();
        else router.push(fallback);
      }}
      className={className}
    >
      {showIcon && <ArrowLeft size={iconSize} />}
      {children}
    </button>
  );
}
