-- M6 phase 2 — align the schema with the finalized business rules.

-- The one legacy marketplace payment row predates the rules below.
update payments set provider = 'manual' where provider = 'paypal';

-- Rule 2: marketplace orders never use PayPal/card. The payments table is
-- marketplace-only (vehicle rentals settle on bookings.paypal_capture_id and
-- place bookings on place_bookings, neither of which touch this table), so this
-- constraint cannot affect the rental ecosystem. Postgres has no DROP VALUE for
-- enums, so a CHECK is the strongest enforcement available.
alter table payments add constraint payments_no_card_providers
  check (provider in ('cash', 'bank_transfer', 'mcb_juice', 'manual'));

-- Rule 5: three delivery choices, not two.
--   pickup            - collect from the shop, no fee
--   customer_delivery - customer arranges their own driver, no fee
--   rr_delivery       - Roule Rodrigues team delivers, platform fee applies
alter table orders drop constraint if exists orders_fulfillment_method_check;
alter table orders add constraint orders_fulfillment_method_check
  check (fulfillment_method in ('pickup', 'customer_delivery', 'rr_delivery'));

-- Both delivery modes need a GPS fix: the RR team needs it to navigate, and a
-- customer's own driver needs something shareable.
alter table orders drop constraint if exists orders_delivery_needs_gps;
alter table orders add constraint orders_delivery_needs_gps check (
  fulfillment_method not in ('customer_delivery', 'rr_delivery')
  or (delivery_lat is not null and delivery_lng is not null)
);

-- Rule 3: MCB Juice QR is its own toggle, independent of bank transfer.
alter table store_payment_settings
  add column if not exists accepts_juice_qr boolean not null default false;

alter table store_payment_settings drop constraint if exists at_least_one_method;
alter table store_payment_settings add constraint at_least_one_method
  check (accepts_cash or accepts_bank_transfer or accepts_juice_qr);

-- A shop cannot advertise Juice with no QR for customers to scan.
alter table store_payment_settings add constraint qr_present_when_juice_enabled
  check (not accepts_juice_qr or nullif(trim(qr_image_url), '') is not null);

-- Rule 1: an expired subscription blocks publishing/editing products and editing
-- shop settings, while leaving existing products visible and order history
-- readable. Enforced by trigger so it holds on EVERY path - the RPCs, the API
-- routes, and a direct PostgREST call alike, rather than only where application
-- code remembers to check.
--
-- Platform admins and service-role callers (auth.uid() is null) bypass, so admin
-- tooling still works. Onboarding is unaffected: a merchant with no subscription
-- row yet is treated as active by merchant_subscription_active().
create or replace function enforce_active_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_store uuid;
begin
  if auth.uid() is null or is_platform_admin() then return new; end if;

  if tg_table_name = 'products' then
    v_store := new.store_id;
  elsif tg_table_name = 'stores' then
    v_store := new.id;
  end if;

  if v_store is not null and not store_subscription_active(v_store) then
    raise exception using errcode = 'RR008',
      message = 'Your subscription has expired. Renew it to make changes.';
  end if;
  return new;
end $$;

create trigger t_products_require_subscription
  before insert or update on products
  for each row execute function enforce_active_subscription();

create trigger t_stores_require_subscription
  before update on stores
  for each row execute function enforce_active_subscription();
