// ── WHERE "BACK" SHOULD ACTUALLY GO ─────────────────────────────────────────
//
// Thirteen pages carry a back arrow hardcoded to href="/". That is right for
// exactly one visitor: the one who arrived from the homepage. Everybody else is
// thrown to the top of the site. The owner's report was about the account area
// — /account → Orders → back → homepage, not /account — but the bug is the
// same everywhere the arrow is a fixed link rather than a way back.
//
// The obvious fix, router.back(), has its own failure: somebody who opened the
// page from a search result or a shared link has no in-app history, and back()
// walks them off the site entirely. A back arrow that leaves the site is worse
// than one that goes to the wrong page.
//
// So the question is "has this visitor navigated inside the app before now?"
// document.referrer cannot answer it — after a client-side navigation it still
// names whatever loaded the document, so a visitor who came from Google and
// then moved around the site looks external forever. A counter can: one number
// in sessionStorage, incremented on every in-app navigation.
//
// Kept pure and separate so the rule is testable without a browser, and so the
// two places that touch sessionStorage agree about the key and the shape.

export const NAV_DEPTH_KEY = "rr_nav_depth";

/**
 * Is there somewhere inside the app to go back TO?
 *
 * Depth 1 means this page is the first thing the visitor saw in this tab —
 * a deep link, a shared URL, a search result. There is no in-app history to
 * return to, so the caller should navigate to a declared parent instead.
 */
export function canGoBack(depth: number): boolean {
  return Number.isFinite(depth) && depth > 1;
}

/** The stored depth, or 0 when storage is unavailable or holds nonsense. */
export function readDepth(storage?: Pick<Storage, "getItem">): number {
  try {
    const raw = (storage ?? sessionStorage).getItem(NAV_DEPTH_KEY);
    const n = Number.parseInt(raw ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    // Private mode, or storage refused. 0 means "no history we can prove",
    // which sends the visitor to the declared parent — the safe direction.
    return 0;
  }
}

/** Record one more in-app navigation. Never throws. */
export function bumpDepth(storage?: Pick<Storage, "getItem" | "setItem">): void {
  try {
    const s = storage ?? sessionStorage;
    const next = readDepth(s) + 1;
    s.setItem(NAV_DEPTH_KEY, String(next));
  } catch {
    /* nothing to count with; canGoBack() will say no and the fallback runs */
  }
}
