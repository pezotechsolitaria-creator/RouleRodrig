# Why reset links said "expired" one second after arriving

Reported from production on 2026-08-11 with screenshots: the email arrived
correctly branded from `bookings@roulerodrig.com`, was clicked **within
seconds**, and the page said

> This reset link has expired or has already been used.

It had not expired. **Every reset link was failing, 100% of the time**, and the
message was blaming the wrong thing.

---

## Fault 1 — the page handled no token at all (FIXED in code)

`app/auth/reset-password/page.tsx` waited 1.2 seconds for a session to appear
from the URL **fragment**, then declared the link dead. It performed no code
exchange, no `verifyOtp`, no fragment parsing — nothing.

But `lib/supabase/client.ts` uses `createBrowserClient()` from `@supabase/ssr`,
which uses the **PKCE** flow. PKCE returns `?code=` in the **query string** and
requires an explicit `exchangeCodeForSession()` call. The session could
therefore never appear on its own, and the 1.2-second wait always elapsed.

The page now handles all three shapes Supabase can send, because which one
arrives depends on flow type, email template and device:

| Arrival | Handler | Works across devices? |
|---|---|---|
| `?token_hash=&type=recovery` | `verifyOtp()` | **Yes** — carries no verifier |
| `?code=` | `exchangeCodeForSession()` | **No** — verifier is in the browser that asked |
| `#access_token=` | client picks it up | Yes |

`/auth/callback` had the identical defect for **sign-up confirmation** and is
fixed the same way. That one mattered just as much: people sign up on a laptop
and open the confirmation on their phone, because that is where mail is read.

---

## Fault 2 — PKCE cannot work across devices (MITIGATED, then FIXED by Fault 3)

Even with the exchange in place, `?code=` only works in the **same browser** that
requested the reset. The `code_verifier` is stored there and nowhere else. Ask
on a laptop, open on a phone → the exchange fails, correctly and permanently.

The page now says so plainly instead of blaming expiry, because "expired" sends
the person round the same loop forever:

> This link has to be opened in the same browser that asked for it.

That is a real improvement, but it is still a dead end for the most common
real-world path. Fault 3 removes it entirely.

---

## Fault 3 — Gmail consumes the link before the human clicks (NEEDS THE OWNER)

Supabase's default template sends the user to **Supabase's own verify endpoint**:

```
https://<project>.supabase.co/auth/v1/verify?token=…&type=recovery&redirect_to=…
```

That URL is **single-use, and consumed by any GET**. Gmail, Outlook and
corporate mail scanners fetch links to check them for malware. The scanner burns
the token; by the time the human taps it, it genuinely *has* "already been used"
— which is exactly the wording the user saw.

**The fix is a template change, and only the owner can make it.**

### Do this

**Supabase Dashboard → Authentication → Email Templates → "Reset password"**

Replace the link line. The default is:

```html
<a href="{{ .ConfirmationURL }}">Reset password</a>
```

Change it to:

```html
<a href="{{ .SiteURL }}/auth/reset-password?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

**Do the same for "Confirm signup"**, pointing at the callback:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
```

### Why this fixes it

The link now points at **our page**, not Supabase's verify endpoint. A mail
scanner fetching it receives ordinary HTML and consumes nothing — the token is
only spent when the page's **JavaScript** calls `verifyOtp()`, and scanners do
not execute JavaScript.

It also solves Fault 2 for free: `token_hash` carries no verifier, so a link
requested on a laptop opens correctly on a phone.

`{{ .SiteURL }}` resolves to whatever is set at **Authentication → URL
Configuration → Site URL**, which must be `https://roulerodrig.com`.

### Verify

1. Request a reset from `roulerodrig.com/login` **on a laptop**.
2. Open the email **on your phone**.
3. It must open the "Choose a new password" form — not an error.
4. Set a password and confirm you can sign in with it.

Step 2 is the whole test. Before this change it was guaranteed to fail.

---

## Note on the one-hour expiry

The email says the link lasts an hour and that is true. Nothing above changes
it. Every failure described here was a link being **consumed or unexchangeable**,
never one that had timed out — which is why the old message was so misleading.
