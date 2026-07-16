# Lessons — rules written after a correction or a self-caught mistake

Reviewed at the start of every session. Each entry: what went wrong, then the
rule that prevents it recurring.

---

## L1 — Never mark up content that isn't on the page
**What happened:** The homepage emitted `Product` JSON-LD for every vehicle, but
the fleet moved to `/browse` and is no longer rendered on `/`. Invisible markup
is against Google's guidelines — ignored at best, a spam signal at worst.
**Rule:** Before adding structured data, confirm the marked-up content is
literally rendered on that URL. Markup describes the page; it is not a place to
inject keywords.

## L2 — No invented metrics, ever
**What happened:** Asked for 500+ keywords with volume/difficulty/competition.
No Ahrefs/GSC is connected. Producing those numbers would have looked complete
and been fabricated — and every downstream decision would inherit the lie.
**Rule:** State the gap and ship what's real. Intent and page mapping need
judgement, not a tool. Volume and difficulty need a tool — if it's absent, say
so and mark the item blocked. A smaller true plan beats a big fake one.

## L3 — Check the claim before calling it a crisis
**What happened:** Found `/browse/<unknown>` returning HTTP 200 with the
not-found body and called it a "real SEO bug". Then checked properly: Next
already emits `<meta name="robots" content="noindex">` there, so it can't be
indexed. Untidy (wasted crawl budget), not harmful.
**Rule:** Verify severity before reporting it, and correct the record out loud
when a finding shrinks. An overstated finding spends the owner's attention on
the wrong thing.

## L4 — Verify against the production build, not just dev
**What happened:** Status-code behaviour was suspected to be a dev artifact, so
it was retested with `next start` on the real build. Dev and prod genuinely do
differ on some responses.
**Rule:** Any finding about status codes, caching, or streaming must be
reproduced against `npm run build && next start` before it's reported.

## L5 — IDs are not names: check what the user actually receives
**What happened:** The booking form posts `<option value={s.id}>`, so
`bookings.scooter` stores `"burgman"` — and every customer email rendered that
raw slug ("Vehicle: burgman"). It shipped and went out to real customers,
including the German booking, because the email templates were reviewed as
templates and never against a real record.
**Rule:** For anything customer-facing, trace the actual value end to end from
the form to the inbox. Read the real row in the database, don't trust the field
name. And fix presentation mapping in ONE shared place — patching each call site
guarantees the next code path (cron reminders, digests) misses it.

## L6 — Verify metadata against the numeric rule, don't eyeball it
**What happened:** Wrote titles/descriptions that "looked about right". Measured
them afterwards: 3 of 7 browse pages failed the 50–60 / 140–160 rule.
**Rule:** Run the length check as code before committing metadata. "Looks fine"
is not verification.

## L7 — Don't pollute real data to test
**What happened:** Needed a real send to check the confirmation email. Posted a
booking to the production API (the genuine trigger chain) with far-future dates
so it couldn't collide with a real customer, then deleted the row and confirmed
zero leftovers.
**Rule:** Test through the real path when that's what's being verified, but pick
values that can't collide with live data, clean up immediately, and prove the
cleanup with a query.
