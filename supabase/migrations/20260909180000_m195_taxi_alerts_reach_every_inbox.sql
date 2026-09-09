-- ── THE OWNER WAS MISSING TAXI BOOKINGS ────────────────────────────────────
--
-- Booking a taxi raised nothing but one email. app/api/rides called
-- sendRideEmails and stopped: no WhatsApp, no ntfy, nothing on the phone the
-- owner actually carries. A request arrived and sat in /admin/rides until
-- somebody thought to look. On 9 Sept a real one came in at 17:14 and reached
-- exactly one mailbox.
--
-- Almost everything needed already existed. `notification_category` has had a
-- `rides` value all along, the worker sends on whatsapp, ntfy AND email, and
-- three slots — two CallMeBot numbers and the owner's ntfy topic — carry
-- `categories = '{}'`, which enqueue_notification reads as "every category".
-- They were never going to fire, because nothing raised the event.
--
-- The code half raises it. This is the half that adds the two mailboxes the
-- owner asked for and did not have.
--
-- ── WHY THESE TWO ARE SCOPED TO rides, AND ninjaespion23 IS NOT HERE ───────
-- sendRideEmails() already emails the owner inbox directly with the full
-- bilingual HTML alert, and email_log confirms it landing within a second of
-- each of the last two bookings. A slot for that same address would send it
-- TWICE for every ride.
--
-- So these two are the addresses that were getting nothing, and they take
-- `{rides}` rather than `{}` — an all-categories email slot would also start
-- mailing them every delivery, order and payment event on the platform, which
-- is not what was asked for and is how an alert channel becomes noise somebody
-- learns to ignore. Widening later is one UPDATE.
--
-- Verified against production and rolled back: enqueue_notification('rides')
-- now returns 5 jobs —
--   whatsapp -> +23058355588
--   whatsapp -> +23058363401
--   ntfy     -> rr-e40e76eeec1a49438f25bfd2bde16607
--   email    -> bookings@roulerodrig.com
--   email    -> roulerodrig@gmail.com
-- plus the direct email to the owner inbox, which is unchanged.
insert into notification_slots (name, channel, target, categories, is_active)
values
  ('Owner email (bookings@)', 'email', 'bookings@roulerodrig.com',
   array['rides']::notification_category[], true),
  ('Owner email (gmail)',     'email', 'roulerodrig@gmail.com',
   array['rides']::notification_category[], true)
on conflict do nothing;
