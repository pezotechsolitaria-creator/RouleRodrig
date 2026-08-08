# Owner actions — things only you can do

> Everything in the codebase that could be prepared for these has been. Each item
> below needs your account, your DNS, your money, or your business decision.
> Verified against the live project on **2026-08-08**. No secrets appear here.

Ordered by what actually matters. **Items 1–3 are the launch blockers.**

---

## 1. Upstash Redis — makes rate limits real · 5 min · free

**Why:** limits are currently in-memory *per serverless instance*, so the true
ceiling is `limit × number of instances`. Under the traffic that accompanies an
attack, Vercel scales out and the limit loosens exactly when it should tighten.

**Do:**
1. `console.upstash.com` → **Create Database** → Redis → region closest to Europe.
2. Open the **REST API** tab. Copy the two values shown there.
3. Vercel → your project → Settings → Environment Variables → **Production**:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
4. Redeploy.

**Verify:** open `https://roulerodrig.com/api/health` and look at
`checks.rateLimiter`. It must read `"shared"`. If it still says `"in-memory"`,
the variables did not reach the Production environment.

**If you skip it:** nothing breaks. The local limiter stays in charge — this is
a documented fallback, not a failure mode.

---

## 2. Email authentication (SPF · DKIM · DMARC) — decides whether guest checkout works at all · 20 min · free

**Why:** guest checkout **is** email. The confirmation, the tracking link, the
payment reminder and the "your reservation expires tomorrow" nudge all arrive by
mail. Without domain authentication these land in spam and the feature
effectively does not exist.

**Do:**
1. In your email provider (Brevo → *Senders, Domains & Dedicated IPs* → **Domains**
   → Authenticate; or Resend → **Domains** → Add Domain), add `roulerodrig.com`.
   It will show you the exact records — use **its** values, not examples.
2. In Cloudflare DNS for `roulerodrig.com`, add each record it gives you:
   - a **TXT** record for SPF
   - a **TXT** (or CNAME) record for DKIM
   - a **TXT** record `_dmarc` — start with `v=DMARC1; p=none; rua=mailto:you@…`
     (`p=none` reports without rejecting; tighten to `quarantine` after a week of
     clean reports)
3. **Every one of these must stay grey-cloud / "DNS only".** Same standing rule
   as the site records — proxying breaks things silently.
4. Wait for the provider to show the domain as verified.

**Verify:** place a test guest order at your own address and confirm the mail
lands in **Inbox**, not Promotions or Spam. Then send one to a Gmail address and
open *Show original* — SPF, DKIM and DMARC should all read `PASS`.

---

## 3. Supabase leaked-password protection · 30 sec · free

**Why:** it checks new passwords against HaveIBeenPwned at sign-up. Flagged by
Supabase's own security linter on your project right now.

**Do:** Supabase Dashboard → **Authentication** → **Policies** (or *Attack
Protection*, depending on where the dashboard has it today) → enable **Leaked
password protection**.

**Note:** this is a dashboard-only toggle — there is no API to set it from code,
which is why it is on this list rather than in a migration.

---

## 4. Decide the marketplace monetization model · your call

The system is now built for all four, and switching between them takes one click
and never rewrites a past order.

Go to **`/admin` → Monetization & Revenue** and choose:

| Option | What it means for a shop |
|---|---|
| **Free** | No monthly fee, no commission. Best while you are recruiting the first shops. |
| **Commission only** | Selling is free; you keep a % of each completed sale. |
| **Subscription only** | Shops pay monthly and keep every rupee. *(This is what is set today, at Rs 0.)* |
| **Subscription + commission** | Both. |

**What you need to decide:**
- The **commission %**, if you pick commission or hybrid. The screen shows you a
  worked Rs 1,000 example as you type.
- The **monthly price** of Starter / Standard / Premium. All three are Rs 0.00
  today, which is why nobody is being billed.

**Two things worth knowing before you choose:**
- Commission is charged on the **goods only** — never on tax, never on a Roulé
  Rodrigues delivery fee (that fee is already your income; taking a percentage of
  it would be charging yourself).
- Commission is **earned when an order is paid**, and reversed if it is refunded
  or cancelled after payment. Unpaid and expired orders never generate a fee.

**My recommendation:** launch on **Free**, get 5–10 shops trading and prove the
marketplace works, then switch to **Subscription only** at a low price. Commission
is harder to explain to a small Rodrigues shopkeeper and harder to collect
without a payout system — and you do not have one yet.

---

## 5. Vercel plan — only if you want an hourly expiry sweep · your call · costs money

**Why:** the cron runs **once a day** (Hobby's limit), so a lapsed reservation
can hold stock for up to 24h past the deadline both parties were shown.

**Do (only on Pro):** change `vercel.json` → `"schedule": "0 6 * * *"` to
`"0 * * * *"`. Tell me and I will make the change; I have deliberately **not**
made it, because on Hobby it would simply fail.

**Not urgent** while you have one shop. It matters when several shops share
scarce stock.

---

## 6. Give me your event organizer · your call

You said you found one. This is now the highest-value thing on the list, because
the Smart Ticketing proposal below is architecture and **they are the
requirements document**. What I need from them:

1. What is the event, and when?
2. Expected attendance, and is capacity a hard limit (a venue) or soft (a field)?
3. **How many people will buy at the door in cash vs in advance?** This one
   decides the whole design.
4. How many entrances, and how many staff scanning?
5. Is there phone signal at the venue? Which network?
6. Do they want printed tickets, or are phones enough?
7. Do they already sell tickets somehow — notebook, Facebook, a shop?

Answers to 3 and 5 change the architecture materially. Everything else is detail.

---

## 7. Standing rules (no action — just do not undo these)

- Cloudflare DNS for `roulerodrig.com` stays **grey-cloud / DNS only**. Orange
  cloud breaks Vercel's TLS certificate issuance.
- `CRON_SECRET` must stay set in Vercel. The daily job **fails closed** without
  it — it stops rather than running unauthenticated.
- `SUPABASE_SERVICE_ROLE_KEY` must stay set. Guest checkout, guest order lookup
  and all admin writes structurally require it.
- Rotating `SESSION_SECRET` logs out every admin session immediately.

**Verify all of these at once:** `https://roulerodrig.com/api/health` — it reports
`database`, `adminBackend`, `cron`, `rateLimiter` and the running build, and
never exposes a secret value.

---

## Environment variable checklist

Set in **Vercel → Settings → Environment Variables → Production**. Values are
never printed here or anywhere in the repo.

| Variable | Required? | Consequence if missing |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Nothing works |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Yes** | Nothing works |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Guest checkout 503s; admin writes fail |
| `NEXT_PUBLIC_SITE_URL` | **Yes** | Wrong links in every email, wrong canonical tags |
| `ADMIN_PASSWORD` | **Yes** | No admin access |
| `SESSION_SECRET` | **Yes** | Admin sessions cannot be signed |
| `CRON_SECRET` | **Yes** | Daily job refuses to run (fails closed, by design) |
| `BREVO_API_KEY` + `BREVO_FROM` | **Yes** | No email at all → guest checkout is unusable |
| `OWNER_EMAIL` | **Yes** | You get no order alerts |
| `OWNER_WHATSAPP` | Recommended | No WhatsApp buttons in emails |
| `UPSTASH_REDIS_REST_URL` + `_TOKEN` | Recommended | Rate limits stay per-instance (item 1) |
| `CALLMEBOT_PHONE` + `_APIKEY` | Optional | No WhatsApp owner pings |
| `GOOGLE_REVIEW_URL` | Optional | Feedback emails have no review link |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` + `PAYPAL_SECRET` + `PAYPAL_ENV` | Vehicle rentals only | Rental deposits fail; marketplace unaffected |
