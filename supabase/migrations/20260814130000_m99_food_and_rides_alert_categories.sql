-- M99 — the two businesses that had nowhere to send an alert.
--
-- notification_category listed deliveries, rentals, ticketing, payments,
-- bookings, system and admin. Since it was written the platform gained a FOOD
-- ordering business with its own kitchens and a TAXI/rides business with its
-- own drivers, and neither had a category — so "send kitchen alerts to the
-- restaurant" could not be expressed at all.
--
-- The workaround was to leave a recipient's categories EMPTY, which
-- enqueue_notification reads as "everything". That is why alerts have been
-- arriving, and also why a cook would necessarily get the same traffic as the
-- owner: the only way to quieten someone was to remove them entirely.
--
-- Additive and safe: every existing row keeps its meaning, and a recipient with
-- no categories still receives everything, including these.
alter type public.notification_category add value if not exists 'food';
alter type public.notification_category add value if not exists 'rides';
