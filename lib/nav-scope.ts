// ── WHERE THE VISITOR'S NAVIGATION BELONGS, AND WHERE IT DOES NOT ────────────
//
// The owner's report: "nav button should not be everywhere! BE LOGICAL and put
// it in places where it should be... for example it is admin makes zero sense."
//
// He is right, and the reason it happened is visible in one line. BottomNav read:
//
//     if (pathname === "/" || pathname.startsWith("/merchant")) return null;
//
// Two exceptions, added one at a time as each was noticed. Everything else got
// the customer's tab bar — including /admin, where the platform operator was
// offered "Order food" and "Ti Roulé" underneath the order queue, and /checkout,
// where a floating bar sat next to the pay button competing for the same thumb.
//
// So the rule is inverted here: instead of listing the pages that opt OUT one by
// one, name the two KINDS of screen that never carry it, and let everything else
// be a normal page.
//
//  1. CONSOLES — a screen for running the business, not visiting the site. Each
//     already has its own navigation, built for its own job. Two navigations on
//     one screen is worse than either alone.
//  2. FOCUSED FLOWS — sign-in and checkout. One decision on screen, and a tab
//     bar is five invitations to abandon it.
//
// Pure and tested, because "the nav shows on the wrong page" is exactly the kind
// of bug that comes back when the rule lives inline in a component.

/** Consoles. Each ships its own navigation; the visitor's tabs are wrong here. */
export const CONSOLE_PREFIXES = [
  "/admin", // components/admin/AdminShell.tsx
  "/merchant", // components/merchant/MerchantNav.tsx
  "/organizer", // app/organizer/layout.tsx
  "/driver", // app/driver/DriverDashboard.tsx
  "/partner", // app/partner/layout.tsx
  "/kitchen", // app/kitchen/KitchenBoard.tsx — a cook mid-service does not
  // want "Order food" and a mascot over the order they are cooking.
] as const;

/**
 * One-decision screens. A tab bar here is an exit, not a convenience.
 *
 * `/deliver` joined this list once the request flow became four steps with a
 * pinned primary action. It is the same shape the comment above describes for
 * `/checkout`: one decision on screen, and a floating bar sitting beside the
 * button competing for the same thumb.
 *
 * It is also 80px. On a 812px phone the header takes 65 and the pinned action
 * takes the bottom, and those 80px of clearance for a bar nobody taps during a
 * form were the single largest remaining block of a measured 534px budget.
 * Leaving is still one tap: the logo goes home and the account link is in the
 * header, which is sticky.
 *
 * `/taxi/book` and `/transfers` joined for the same reason and on the same
 * measurements. Both are booking forms with a primary action at the bottom, and
 * the floating pill was taking 138px off each of them: a 64px in-flow spacer
 * that lengthens the document, plus a ~74px pill that hovers over exactly where
 * a thumb reaches for the button. On /taxi/book step 2 that was most of the
 * remaining scroll once the form itself had been fixed.
 *
 * Note the prefixes are deliberately narrow. `/taxi` is a DIRECTORY somebody
 * browses — the tab bar belongs there. Only the booking path loses it, and
 * `/taxi/track` keeps it too, because following a ride is not a form.
 */
export const FOCUSED_PREFIXES = [
  "/checkout",
  "/login",
  "/auth",
  "/deliver",
  "/taxi/book",
  "/transfers",
] as const;

/**
 * Does the visitor's bottom tab bar belong on this path?
 *
 * `/` is excluded for a different reason from the rest: the app-style homepage
 * renders its own wider bar from the same tab list, so the floating pill would
 * be a second copy.
 */
export function showsVisitorNav(pathname: string): boolean {
  if (pathname === "/") return false;
  if (isConsole(pathname)) return false;
  if (
    FOCUSED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  )
    return false;
  return true;
}

/**
 * Does the site footer belong on this path?
 *
 * A SEPARATE RULE FROM showsVisitorNav, on purpose. That one keeps the tab bar
 * off focused flows because a FLOATING pill sits over the primary action and
 * competes for the same thumb. A footer is the opposite kind of object: it is
 * in normal document flow, at the end, below the fold. It cannot compete with
 * a button it is not covering, so /checkout, /deliver and /taxi/book keep it —
 * and those are pages where the company line and the legal links have the most
 * reason to be reachable.
 *
 * Two exclusions remain, for two different reasons:
 *
 *  1. CONSOLES. A marketing footer under the order queue is the same mistake
 *     the comment at the top of this file describes: chrome for visiting the
 *     site, put on a screen for running it.
 *  2. `/`. The homepage renders <Footer> itself, with the sponsor strip above
 *     it (app/page.tsx). Mounting it globally too would print it twice.
 */
export function showsSiteFooter(pathname: string): boolean {
  if (pathname === "/") return false;
  return !isConsole(pathname);
}

/** Is this a console — a screen for running the business rather than using it? */
export function isConsole(pathname: string): boolean {
  return CONSOLE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Which console this path belongs to, or null.
 *
 * Used to put "your account" in each console's own chrome: whichever door a
 * person came through, they can always get back to the one page that lists all
 * of their doors.
 */
export function consoleOf(
  pathname: string,
): (typeof CONSOLE_PREFIXES)[number] | null {
  return (
    CONSOLE_PREFIXES.find(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    ) ?? null
  );
}
