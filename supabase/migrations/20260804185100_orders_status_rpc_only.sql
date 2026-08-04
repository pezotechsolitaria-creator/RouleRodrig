-- Tightens the previous lockdown further: verified no code path in this repo
-- writes orders.status directly (the PayPal capture route updates a
-- different, legacy `bookings` table, not marketplace `orders` — the
-- marketplace has no payment webhook wired yet). Direct grant access to
-- `status` would let a store-staff member skip update_order_status()'s
-- legality check and its customer-notification insert (e.g. jump straight
-- from "paid" to "collected" with no "preparing"/"ready_for_pickup" step and
-- no notification). Status changes now go through the RPC exclusively;
-- internal_notes stays directly grantable since it isn't state-machine data.
revoke update on orders from authenticated;
grant update (internal_notes) on orders to authenticated;
