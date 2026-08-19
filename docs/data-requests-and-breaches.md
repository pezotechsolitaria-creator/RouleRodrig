# When someone asks for their data, or something leaks

Two things the Privacy Policy now promises publicly. This is how they get done.
It is deliberately short: a runbook nobody can follow at 9pm on a Sunday is the
same as no runbook.

Legal decisions — whether to notify, what to say to a regulator — are the
owner's, not the platform's. This document only covers finding and moving the
data.

---

## 1. A customer asks to see, correct or delete their data

They will write to the address on `/legal/privacy` (currently
`bookings@roulerodrig.com`). The policy commits us to answering, and to one
month for EU/UK visitors.

**Before anything else: confirm who they are.** Reply to the email address
already on the booking, or ask for the booking reference. Never act on a request
that arrives from an address not already attached to the records — handing one
customer's data to another is itself a breach.

**Where their data actually is:**

| What | Where to look |
|---|---|
| Vehicle rentals | `bookings` |
| Activities, stays, experiences | `place_bookings` |
| Food and shop orders | `orders` (+ `order_items`) |
| Uploaded transfer receipts | private storage bucket, path on the order/booking row |
| Taxi and private hire | `rides`, and `taxi_drivers` if they are a driver |
| Driver positions | `driver_locations` |
| Account | Supabase Auth user |
| Push subscriptions | notification subscription rows |
| Analytics + errors | PostHog and Sentry, by their user id |

`/admin/customers` is the fastest way in — search by phone or email.

**What we can and cannot delete.** Once an order has been *paid*, the
transaction record has to be kept for accounting and tax. The policy says this
plainly, so say it plainly to the customer too: name what is being kept, and
why. Everything not tied to a paid transaction — an abandoned booking, a push
subscription, an account, analytics history — can go.

**Deleting is not the same as anonymising.** For a paid order, the usual answer
is to strip the personal columns (name, phone, email, address) and keep the
amounts and dates. That satisfies both obligations at once.

---

## 2. Something has leaked

A leak is not only an attacker. A misdirected email with someone's booking in
it, a receipt shown to the wrong merchant, or a service-role key committed to a
repo are all the same category.

**In the first hour:**

1. **Stop it getting worse.** Rotate the key, revoke the session, take the
   endpoint down. Availability is worth less than containment here.
2. **Write down what you know** — when, which table or bucket, roughly how many
   people, and which fields. This is the whole of the notification decision
   later, and it is much harder to reconstruct a week on.
3. **Tell the owner.** Not a ticket — a phone call. The Command Centre's
   WhatsApp escalation exists for this.

**Then, and this is the owner's call, not the platform's:** whether the Data
Protection Office of Mauritius has to be told, and whether the affected people
do. Get that decision from the owner, and take advice if it involves payment
data or a large number of people.

**Worth knowing in advance:** card numbers are never on our systems — the
payment provider holds them. Passwords are held by Supabase Auth and we never
see them. What we *do* hold that would hurt is names with phone numbers and
addresses, and the uploaded bank transfer slips. Those are the ones to check
first.

---

## 3. Keeping the policy honest

`lib/legal.test.ts` fails the build if the Privacy Policy starts claiming
something the code contradicts — it already caught the site denying location
tracking while `driver_locations` was recording positions.

It cannot check a claim nobody thought to write a test for. **So when you add a
feature that collects something new from a person, update
`app/legal/privacy/page.tsx` in the same change.** That is the whole discipline.
