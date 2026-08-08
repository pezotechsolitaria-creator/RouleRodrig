-- M27 — The pickup handoff: make qr_pickup_tokens a feature instead of a table.
--
-- WHAT WAS WRONG
-- qr_pickup_tokens has existed since 20260730000001 (marketplace_core) with a
-- hash column, an expiry, a single-use stamp, an attempts counter and an RLS
-- policy. Nothing has ever INSERTed a row — verified across every migration and
-- every app file. Both order-detail screens render a "Pickup" panel gated on
-- `qr_pickup_tokens.length > 0`, so the panel has never appeared, and pickup is
-- the DEFAULT fulfilment method. The handoff was: the customer says an order
-- number out loud and the merchant remembers to tap "Mark collected".
--
-- WHAT THIS SHIPS, AND WHY IT IS A CODE AND NOT A QR IMAGE
-- The table's name says QR; the design does not. Rendering a real QR needs a new
-- client dependency, and REDEEMING one needs a camera in the merchant's hand —
-- BarcodeDetector is still absent on iOS Safari, the permission prompt fails in
-- exactly the busy, bright, one-handed moment it is needed, and a market stall
-- in Port Mathurin is the worst possible place to debug a camera. So the token
-- is delivered as EIGHT CHARACTERS the customer can hold up, read aloud, or send
-- on WhatsApp, and the merchant types into a box. Same table, same guarantees,
-- no camera. A QR image can be layered on later — it would encode this same
-- code, so nothing here has to change.
--
-- THE GUARANTEES, matching accept_order:
--   single-use  — redeemed_at is stamped under a row lock, inside the same
--                 transaction that moves the order to `collected`.
--   expiring    — expires_at, owner-configurable, refused past it.
--   merchant    — is_store_staff() on the order's own store, and an unknown
--   -only         code is refused with the SAME message as another shop's code,
--                 so the endpoint cannot be used to probe for live codes.
--   idempotent  — redeeming an already-redeemed code returns the same success
--                 payload instead of erroring. A double-tap at the counter must
--                 not read as a failure.
--
-- The raw code is stored (the customer has to be able to look at it more than
-- once) but is never granted to any client role: it leaves the database only
-- through the three SECURITY DEFINER accessors below, each of which proves the
-- caller owns the order.

-- ── 1. Owner-configurable lifetime ──────────────────────────────────────────
-- Beside order_hold_hours and max_open_reservations, so every commercial dial
-- lives on one row and needs no deploy. 14 days: an order that has sat
-- uncollected for a fortnight is not a pickup problem any more.
alter table marketplace_settings
  add column if not exists pickup_code_hours integer not null default 336;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketplace_settings_pickup_hours_sane') then
    alter table marketplace_settings
      add constraint marketplace_settings_pickup_hours_sane
      check (pickup_code_hours between 1 and 8760);
  end if;
end;
$$;

comment on column marketplace_settings.pickup_code_hours is
  'How long a pickup code stays redeemable after it is issued. Expiry is a backstop, not the real gate — the code is only redeemable while the order is in ready_for_pickup, and an expired code degrades to the merchant''s existing "Mark collected" button rather than trapping anyone (M27).';

-- ── 2. The code column ──────────────────────────────────────────────────────
alter table qr_pickup_tokens
  add column if not exists code text;

-- Normalised at every write, so the unique index IS the collision check.
create unique index if not exists qr_pickup_tokens_code_key on qr_pickup_tokens (code);
-- ensure_pickup_code()'s hot path: "is there a live code for this order?"
create index if not exists qr_pickup_tokens_live_idx
  on qr_pickup_tokens (order_id, expires_at) where redeemed_at is null;

comment on column qr_pickup_tokens.code is
  'The eight characters the customer shows at the counter. NEVER granted to anon or authenticated — released only by customer_pickup_code(), lookup_order() and the confirmation email, each of which proves the reader owns the order (M27).';

-- ── 3. Code generation ──────────────────────────────────────────────────────
create or replace function public.new_pickup_code()
returns text
language plpgsql
volatile
set search_path to 'public', 'pg_temp'
as $function$
declare
  -- 32 characters with 0/O and 1/I removed: this gets read aloud across a
  -- counter, in three languages, over the noise of a market. 32 divides 256
  -- exactly, so the byte→character map below is perfectly uniform — the usual
  -- modulo bias of a hand-rolled code generator does not exist here.
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_hex      text;
  v_out      text := '';
  i          integer;
begin
  -- gen_random_uuid() is Postgres' cryptographic RNG, not random(): 122 random
  -- bits, of which the 40 used below give 1.1e12 codes. random() is seeded per
  -- backend and predictable, which for a bearer token would be the whole bug.
  v_hex := replace(gen_random_uuid()::text, '-', '');
  for i in 0..7 loop
    v_out := v_out || substr(v_alphabet, (get_byte(decode(substr(v_hex, i * 2 + 1, 2), 'hex'), 0) % 32) + 1, 1);
  end loop;
  return v_out;
end;
$function$;

revoke all on function public.new_pickup_code() from public, anon, authenticated;

/**
 * The live code for an order, creating one if there isn't one.
 *
 * Idempotent by construction: it returns the existing unredeemed, unexpired
 * code rather than minting a second one, so an order never has two valid codes
 * in circulation and re-running the trigger is free.
 *
 * Internal — no authorisation check of its own, and executable by nobody. Every
 * caller (the trigger, and the accessors below) proves ownership first.
 */
create or replace function public.ensure_pickup_code(p_order_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code  text;
  v_hours integer;
  i       integer;
begin
  select t.code into v_code
    from qr_pickup_tokens t
   where t.order_id = p_order_id
     and t.redeemed_at is null
     and t.expires_at > now()
     and t.code is not null
   order by t.issued_at desc
   limit 1;
  if v_code is not null then
    return v_code;
  end if;

  select s.pickup_code_hours into v_hours from marketplace_settings s where s.id = 'main';
  v_hours := coalesce(v_hours, 336);

  -- Five draws from a 1.1e12 space. The loop is not optimism about collisions,
  -- it is the guarantee that a collision cannot fail a merchant's status update.
  for i in 1..5 loop
    v_code := new_pickup_code();
    begin
      insert into qr_pickup_tokens (order_id, code, token_hash, expires_at)
      values (
        p_order_id,
        v_code,
        encode(sha256(convert_to(v_code, 'UTF8')), 'hex'),
        now() + make_interval(hours => v_hours)
      );
      return v_code;
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  -- Unreachable in practice. Returning null degrades to "no code shown", which
  -- the UI handles, rather than aborting the merchant's status change.
  return null;
end;
$function$;

revoke all on function public.ensure_pickup_code(uuid) from public, anon, authenticated;

-- ── 4. Issue on ready_for_pickup — as a TRIGGER, not inside one RPC ─────────
-- Same reasoning as order_financials in M23: update_order_status() is today's
-- only path to ready_for_pickup, but "today's only path" is how the last three
-- gaps in this schema started. A trigger on the column covers every writer,
-- including admin repair scripts and anything added later.
create or replace function public.issue_pickup_code_on_ready()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- Pickup only. A delivery order reaches ready_for_pickup too (there is no
  -- separate "out for delivery" state), and handing a code to a customer who is
  -- not coming to the shop would be noise. The driver module (business rule 7)
  -- is where a delivery handover code belongs, and it can call
  -- ensure_pickup_code() unchanged.
  if new.status = 'ready_for_pickup'
     and old.status is distinct from new.status
     and coalesce(new.fulfillment_method, 'pickup') = 'pickup' then
    perform ensure_pickup_code(new.id);
  end if;
  return null;
end;
$function$;

revoke execute on function public.issue_pickup_code_on_ready() from public, anon, authenticated;

drop trigger if exists t_orders_issue_pickup_code on orders;
create trigger t_orders_issue_pickup_code
  after update of status on orders
  for each row execute function issue_pickup_code_on_ready();

-- Orders already sitting in ready_for_pickup predate the trigger and would
-- otherwise never get a code — the customer would see the panel appear only for
-- orders placed after this deploy.
do $$
declare
  r record;
begin
  for r in
    select o.id from orders o
     where o.status = 'ready_for_pickup'
       and coalesce(o.fulfillment_method, 'pickup') = 'pickup'
  loop
    perform ensure_pickup_code(r.id);
  end loop;
end;
$$;

-- ── 5. Redemption ───────────────────────────────────────────────────────────
create or replace function public.redeem_pickup_code(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_staff  uuid := auth.uid();
  v_norm   text;
  v_tok    qr_pickup_tokens%rowtype;
  v_order  orders%rowtype;
  v_items  integer;
  -- One message for "no such code", "another shop's code" and "malformed code".
  -- Three different answers would turn this endpoint into an oracle for
  -- discovering live codes across the whole marketplace.
  v_deny   constant text := 'No order of yours matches that code.';
begin
  if v_staff is null then
    raise exception using errcode = 'RR020', message = 'Not signed in.';
  end if;

  -- Accept what a human types: lower case, spaces, the dash the UI displays.
  v_norm := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(v_norm) <> 8 then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select * into v_tok
    from qr_pickup_tokens
   where token_hash = encode(sha256(convert_to(v_norm, 'UTF8')), 'hex')
   for update;
  if not found then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select * into v_order from orders where id = v_tok.order_id for update;
  if not found or not is_store_staff(v_order.store_id) then
    raise exception using errcode = 'RR021', message = v_deny;
  end if;

  select count(*) into v_items from order_items where order_id = v_order.id;

  -- IDEMPOTENT. A merchant who taps twice, or whose phone retries on a flaky
  -- connection, must see the same handover confirmed — not "invalid code",
  -- which at a counter reads as "this customer is trying something".
  if v_tok.redeemed_at is not null then
    return jsonb_build_object(
      'orderId', v_order.id, 'orderNumber', v_order.order_number,
      'customerName', v_order.customer_name, 'total', v_order.total,
      'itemCount', v_items, 'status', v_order.status,
      'alreadyRedeemed', true, 'redeemedAt', v_tok.redeemed_at);
  end if;

  -- Every refusal past this point is a real attempt against a real code, so it
  -- is counted. Ten wrong tries and the code is dead — a brute-force attempt
  -- that somehow lands on a live token cannot then grind through the states.
  if v_tok.attempts >= 10 then
    raise exception using errcode = 'RR024',
      message = 'This code has been tried too many times. Mark the order collected from the order page instead.';
  end if;

  if v_tok.expires_at <= now() then
    update qr_pickup_tokens set attempts = attempts + 1 where id = v_tok.id;
    raise exception using errcode = 'RR022',
      message = format('The code for order %s has expired. Open the order and mark it collected instead.', v_order.order_number);
  end if;

  if v_order.status <> 'ready_for_pickup' then
    update qr_pickup_tokens set attempts = attempts + 1 where id = v_tok.id;
    raise exception using errcode = 'RR023',
      message = format('Order %s is "%s", not ready for pickup yet.', v_order.order_number, v_order.status);
  end if;

  update qr_pickup_tokens
     set redeemed_at = now(), redeemed_by = v_staff, attempts = attempts + 1
   where id = v_tok.id;

  -- The transition goes through the same RPC as the merchant's own button, so
  -- the state machine, the stock rules and the customer notification are
  -- written once. It re-proves store membership independently.
  perform * from update_order_status(v_order.id, 'collected', null);

  return jsonb_build_object(
    'orderId', v_order.id, 'orderNumber', v_order.order_number,
    'customerName', v_order.customer_name, 'total', v_order.total,
    'itemCount', v_items, 'status', 'collected',
    'alreadyRedeemed', false, 'redeemedAt', now());
end;
$function$;

revoke all on function public.redeem_pickup_code(text) from public, anon, authenticated;
grant execute on function public.redeem_pickup_code(text) to authenticated;

comment on function public.redeem_pickup_code(text) is
  'Merchant-side handover: verify a customer''s pickup code and move the order to collected in one transaction. Single-use, expiring, store-staff-only, and idempotent on re-submission. Unknown codes and other shops'' codes share one refusal message so the endpoint cannot be used to discover live codes (M27).';

-- ── 6. Reading the code back ────────────────────────────────────────────────
create or replace function public.customer_pickup_code(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
           'code',       t.code,
           'issuedAt',   t.issued_at,
           'expiresAt',  t.expires_at,
           'redeemedAt', t.redeemed_at)
    from qr_pickup_tokens t
    join orders o on o.id = t.order_id
   where t.order_id = p_order_id
     and t.code is not null
     -- The whole authorisation check: this is YOUR order. A guest order has
     -- customer_id null, so this can never match one — guests read their code
     -- through lookup_order(), on the order-number + email credential.
     and o.customer_id is not null
     and o.customer_id = auth.uid()
   order by t.issued_at desc
   limit 1;
$function$;

revoke all on function public.customer_pickup_code(uuid) from public, anon, authenticated;
grant execute on function public.customer_pickup_code(uuid) to authenticated;

-- ── 7. The guest half ───────────────────────────────────────────────────────
-- The M20/M21 lesson, applied up front rather than after the fact: guest
-- checkout is the DEFAULT path and pickup is the DEFAULT fulfilment, so a
-- pickup code that only signed-in customers can see would be invisible to most
-- of the people who need it. Reproduced whole from the M21 definition (repo
-- convention — never string-patch a shipped RPC) with one field added.
create or replace function public.lookup_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_num   text;
  v_email text;
  v_out   jsonb;
begin
  v_num   := upper(btrim(coalesce(p_order_number, '')));
  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_num) < 6 or v_email = '' then
    return null;
  end if;

  select jsonb_build_object(
           'id',            o.id,
           'orderNumber',   o.order_number,
           'status',        o.status,
           'total',         o.total,
           'currency',      o.currency,
           'placedAt',      o.placed_at,
           'fulfillment',   o.fulfillment_method,
           'autoReleaseAt', o.auto_release_at,
           'acceptedAt',    o.accepted_at,
           'isGuest',       o.customer_id is null,
           'storeName',     s.name,
           'storeSlug',     s.slug,
           'storePhone',    s.phone,
           -- Which method is owed. Read from payments, the same row the
           -- signed-in order page reads, never inferred from the status.
           'provider',      (select pm.provider from payments pm
                              where pm.order_id = o.id order by pm.created_at limit 1),
           'receiptSubmittedAt', o.receipt_submitted_at,
           -- The pickup code (M27). Released on the same credential as the rest
           -- of this payload — order number AND the address that placed it —
           -- and only while it can still be used: once redeemed or expired,
           -- showing it would invite a customer to present a dead code.
           'pickupCode',    (select t.code from qr_pickup_tokens t
                              where t.order_id = o.id
                                and t.redeemed_at is null
                                and t.expires_at > now()
                                and t.code is not null
                              order by t.issued_at desc limit 1),
           'pickupRedeemedAt', (select t.redeemed_at from qr_pickup_tokens t
                                 where t.order_id = o.id and t.redeemed_at is not null
                                 order by t.redeemed_at desc limit 1),
           -- Released only while the money is still owed, and only for the
           -- method that needs them.
           'bank', case
             when o.status in ('pending_payment','awaiting_payment_confirmation')
              and exists (select 1 from payments pm
                           where pm.order_id = o.id and pm.provider = 'bank_transfer')
             then (select jsonb_build_object(
                            'bankName',      sp.bank_name,
                            'accountHolder', sp.account_holder,
                            'accountNumber', sp.account_number,
                            'instructions',  sp.payment_instructions,
                            'requireReceipt', coalesce(sp.require_receipt, false))
                     from store_payment_settings sp where sp.store_id = o.store_id)
             else null end,
           'items',         coalesce((
             select jsonb_agg(jsonb_build_object(
                      'name', oi.product_name, 'variant', oi.variant_name,
                      'qty', oi.quantity, 'lineTotal', oi.line_total)
                    order by oi.product_name)
             from order_items oi where oi.order_id = o.id), '[]'::jsonb))
    into v_out
  from orders o
  join stores s on s.id = o.store_id
  where o.order_number = v_num
    and lower(o.customer_email) = v_email
  limit 1;

  return v_out;
end;
$function$;

revoke all on function public.lookup_order(text, text) from public, anon, authenticated;
grant execute on function public.lookup_order(text, text) to service_role;

comment on function public.lookup_order(text, text) is
  'Account-free order lookup for guest checkout: order number + the email that placed it. Returns the shop''s bank details only while a bank transfer is still owed, and the live pickup code while the order is waiting to be collected. SECURITY DEFINER, service_role only (M20, extended M21 and M27).';

-- ── 8. Table lockdown ───────────────────────────────────────────────────────
-- RLS decides WHICH ROW; column grants decide WHICH COLUMNS. qr_pickup_tokens
-- held a blanket table grant, so adding `code` to it would have published every
-- live pickup code in the marketplace to every store's staff through PostgREST.
-- The merchant UI only ever needed the redemption STATE, so that is all it gets.
revoke all on qr_pickup_tokens from anon, authenticated;
grant select (id, order_id, issued_at, expires_at, redeemed_at, redeemed_by, attempts)
  on qr_pickup_tokens to authenticated;

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
declare
  v_code text;
  v_lo   text;
begin
  if not exists (select 1 from pg_trigger where tgname = 't_orders_issue_pickup_code') then
    raise exception 'M27: the ready_for_pickup trigger did not attach.';
  end if;

  -- lookup_order() was reproduced whole. Prove nothing M20/M21 put in it was
  -- dropped on the way through, and that the new field arrived.
  select prosrc into v_lo from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lookup_order';
  if position('pickupCode' in v_lo) = 0 then
    raise exception 'M27: lookup_order() lost the pickup code.';
  end if;
  if position('accountNumber' in v_lo) = 0 or position('autoReleaseAt' in v_lo) = 0 then
    raise exception 'M27: lookup_order() lost an M20/M21 field.';
  end if;

  -- The generator must produce 8 characters from the intended alphabet.
  v_code := new_pickup_code();
  if v_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    raise exception 'M27: new_pickup_code() produced %, which is not an 8-character code.', v_code;
  end if;

  -- The raw code must not be readable by a client role.
  if has_column_privilege('authenticated', 'public.qr_pickup_tokens', 'code', 'SELECT') then
    raise exception 'M27: authenticated can still read qr_pickup_tokens.code.';
  end if;
  if has_table_privilege('anon', 'public.qr_pickup_tokens', 'SELECT') then
    raise exception 'M27: anon still holds SELECT on qr_pickup_tokens.';
  end if;
end;
$$;
