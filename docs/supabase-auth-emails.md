# Supabase auth emails — the localhost link, and the branding

Reported from production on 2026-08-08: a password-reset link landed on
**`localhost` → "Ce site est inaccessible"**, and the email itself was branded
**"powered by Supabase"** rather than Roulé Rodrigues.

These are two separate faults with two separate fixes, and **only one of them
was a code bug.**

---

## Fault 1 — the link pointed at localhost

### Half A — code (FIXED, `lib/auth-redirect.ts`)

Every auth redirect was built from `window.location.origin`:

```ts
redirectTo: `${window.location.origin}/auth/reset-password?next=…`
```

On a production visit that is correct, but it makes the link depend on which
host the person happened to be standing on, and it silently produces
`http://localhost:3000/...` for anything triggered from a dev machine.

A password-reset email is the worst possible place for this, because **the email
outlives the session that created it** — opened an hour later on a phone, it
still carries whatever origin was current at send time.

Now routed through `authRedirect()`, which prefers `NEXT_PUBLIC_SITE_URL`
(always set in Vercel) and only falls back to the current origin in local
development, where the variable is deliberately unset. Same rule `lib/site.ts`
already applies to canonical tags, JSON-LD, the sitemap and every transactional
email link — auth was the last surface deriving its own answer.

### Half B — Supabase dashboard (YOURS — the code fix alone is not enough)

Supabase **refuses any redirect that is not in its allow-list and silently falls
back to the project's Site URL.** If Site URL is still the default
`http://localhost:3000`, links land on localhost no matter how correct the code
is. This is almost certainly the actual cause of the screenshot.

**Supabase Dashboard → Authentication → URL Configuration**

| Setting | Set to |
|---|---|
| **Site URL** | `https://roulerodrig.com` |
| **Redirect URLs** | add `https://roulerodrig.com/**` |

Keep `http://localhost:3000/**` in Redirect URLs as well, so local development
still works. Save.

---

## Fault 2 — "powered by Supabase", and a hard rate limit

The email came from Supabase's **shared** SMTP service. Two consequences, and
the second one is a launch blocker:

1. It is Supabase-branded and comes from a Supabase address. Your customer sees
   a service they have never heard of asking them to reset a password.
2. **Supabase's built-in email service is heavily rate-limited and is documented
   as not for production use.** Once the cap is hit, auth emails simply stop —
   silently. Sign-ups and password resets break with no error anywhere in your
   application.

### The fix: point Supabase at Brevo (YOURS, ~5 minutes)

You already did the hard part. `roulerodrig.com` is authenticated in Brevo with
SPF, DKIM (b1 + b2) and DMARC verified, so auth emails will inherit that
authentication the moment they are sent through Brevo instead.

**Step 1 — get Brevo SMTP credentials**
`app.brevo.com` → account menu → **SMTP & API** → **SMTP** tab. It shows a
server, a port, a login, and an SMTP key. Generate a key if there isn't one.
**Do not paste these anywhere except the Supabase form.**

**Step 2 — Supabase Dashboard → Project Settings → Authentication → SMTP Settings**

| Field | Value |
|---|---|
| Enable Custom SMTP | **ON** |
| Sender email | `bookings@roulerodrig.com` |
| Sender name | `Roulé Rodrigues` |
| Host | the server Brevo shows (e.g. `smtp-relay.brevo.com`) |
| Port | `587` |
| Username | the SMTP login Brevo shows |
| Password | the SMTP key from Brevo |

Save.

**Why `bookings@` and not `hello@`:** only `bookings@roulerodrig.com` is
actually routed to an inbox via Cloudflare Email Routing. `hello@` does not
exist — `lib/site.ts` says so explicitly, and a From address that bounces is a
deliverability problem. (I set the marketplace sender to `hello@` earlier by
mistake; it is now `bookings@` too.)

**Step 3 — verify.** Trigger a password reset from `roulerodrig.com/login`. The
email should arrive **from `Roulé Rodrigues <bookings@roulerodrig.com>`**, with
no Supabase branding, and the button should go to `https://roulerodrig.com/...`.

---

## Fault 3 (cosmetic) — the template wording

Once custom SMTP is on, the templates are still Supabase's defaults. They are
editable at **Authentication → Email Templates** (Confirm signup, Reset
password, Magic link, Change email).

Not urgent — with custom SMTP the emails are already correctly branded in the
From line, which is what customers actually judge. Worth doing before launch,
not before the next test.

The one line worth removing immediately if you edit anything:

> *"You're receiving this email because you signed up for an application powered
> by Supabase"*

---

## Order of operations

1. **Fault 1 Half B** (Site URL + Redirect URLs) — this alone fixes the broken
   link you screenshotted.
2. **Fault 2** (custom SMTP) — fixes branding *and* removes the rate limit.
3. **Fault 3** (templates) — polish, any time before launch.

Half A of Fault 1 is already deployed.
