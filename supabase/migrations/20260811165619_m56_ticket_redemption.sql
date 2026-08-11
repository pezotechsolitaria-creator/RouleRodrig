-- M56 — the door.
--
-- Two halves, and the scanner is useless without the second one:
--
--   1. redeem_ticket() — admit somebody, exactly once.
--   2. lookup_order() now returns the buyer's tickets. Until now NOTHING
--      returned a ticket to the person who bought it: tickets_customer_read
--      requires orders.customer_id = auth.uid(), and an event buyer is a guest
--      with customer_id NULL. So every ticket issued so far existed only in the
--      database. A scanner with nothing to scan is a demo, not a door.
--
-- ── WHY THE PAYLOAD IS A BARE public_id, NOT AN HMAC ────────────────────────
-- public_id is a 122-bit random uuid with a UNIQUE index, so it cannot be
-- guessed or forged without the database. Signing it would add nothing against
-- forgery. It also would not help against the threat that actually matters —
-- somebody screenshotting their own QR and sending it to a friend — because a
-- copied signature is still a valid signature. The only real defence against a
-- copy is that the FIRST scan wins and the second is told, which is what the
-- row lock below provides. Signing would buy offline validation, which this
-- deliberately does not attempt: an offline scanner cannot know a ticket was
-- already used, so it would admit every duplicate. Better an honest dependency
-- on the network than a door that silently lets doubles through.
--
-- ── WHY "ALREADY USED" IS NOT AN ERROR ──────────────────────────────────────
-- At a door, a re-scan is ordinary: a phone re-shown, a queue re-checked, two
-- staff scanning the same group. Raising an exception would make the scanner
-- show a red failure for a normal event, and staff quickly learn to ignore red.
-- So the three real outcomes — admitted, already_used, void — are all SUCCESSFUL
-- returns carrying the facts, and only a ticket that does not exist (or belongs
-- to an event this person does not run) raises RR003.

create or replace function public.redeem_ticket(p_public_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_t        record;
  v_event    record;
  v_outcome  text;
begin
  if auth.uid() is null then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  -- FOR UPDATE is the whole one-time guarantee. Two staff scanning the same
  -- code at the same instant serialise here: the first transaction flips the
  -- row, the second reads the flipped value and reports already_used.
  select t.id, t.store_id, t.state, t.used_at, t.serial,
         t.holder_name, t.ticket_type_name, t.event_name, t.event_starts_at,
         t.void_reason
    into v_t
    from tickets t
   where t.public_id = p_public_id
   for update;

  -- Unknown code and "not your event" are the same answer on purpose: a
  -- distinguishable response would let anyone probe which codes are real.
  if v_t.id is null or not can_manage_event(v_t.store_id) then
    raise exception using errcode='RR003', message='Not a ticket for this event.';
  end if;

  select e.cancelled_at, e.starts_at, e.doors_open_at, e.timezone
    into v_event from events e where e.store_id = v_t.store_id;

  if v_t.state = 'void' then
    v_outcome := 'void';
  elsif v_t.state = 'used' then
    v_outcome := 'already_used';
  else
    update tickets set state = 'used', used_at = now() where id = v_t.id
      returning used_at into v_t.used_at;
    v_outcome := 'admitted';
  end if;

  return jsonb_build_object(
    'outcome',       v_outcome,
    'serial',        v_t.serial,
    'ticketType',    v_t.ticket_type_name,
    'holderName',    v_t.holder_name,
    'eventName',     v_t.event_name,
    'eventStartsAt', v_t.event_starts_at,
    'usedAt',        v_t.used_at,
    'voidReason',    v_t.void_reason,
    -- Informational, never a refusal. Someone scanning a valid ticket days
    -- early is far more likely to be testing than defrauding, and the door
    -- staff are better placed to judge that than a CHECK constraint.
    'eventCancelled', v_event.cancelled_at is not null,
    'earlyByHours',  case
                       when v_event.starts_at is null then null
                       else greatest(0, floor(extract(epoch from (v_event.starts_at - now())) / 3600))::int
                     end);
end;
$function$;

revoke all on function public.redeem_ticket(uuid) from public, anon;
grant execute on function public.redeem_ticket(uuid) to authenticated, service_role;

-- ── The buyer's own tickets, on the credential they already have ────────────
-- Reproduced whole rather than spliced: this function is short enough to read
-- in one screen, and the assertions below prove no earlier key was dropped.
create or replace function public.lookup_order(p_order_number text, p_email text)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp'
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
           -- M55: a kitchen is not a shop. The tracking page uses this to send
           -- the customer back to the menu instead of the shop directory.
           'isFood',        exists (select 1 from food_kitchens fk where fk.store_id = s.id),
           -- M56: nor is an event. Same reasoning, different noun.
           'isEvent',       exists (select 1 from events e where e.store_id = s.id),
           'storeSlug',     s.slug,
           'storePhone',    s.phone,
           'provider',      (select pm.provider from payments pm
                              where pm.order_id = o.id order by pm.created_at limit 1),
           'receiptSubmittedAt', o.receipt_submitted_at,
           'pickupCode',    (select t.code from qr_pickup_tokens t
                              where t.order_id = o.id
                                and t.redeemed_at is null
                                and t.expires_at > now()
                                and t.code is not null
                              order by t.issued_at desc limit 1),
           'pickupRedeemedAt', (select t.redeemed_at from qr_pickup_tokens t
                                 where t.order_id = o.id and t.redeemed_at is not null
                                 order by t.redeemed_at desc limit 1),
           'reviewed',      exists (select 1 from reviews r
                                     where r.order_id = o.id and r.product_id is null),
           'canReview',     o.status = 'collected'
                            and not exists (select 1 from reviews r
                                             where r.order_id = o.id and r.product_id is null),
           -- M56. THE TICKET ITSELF. Scoped to this order, reached only with the
           -- order number plus the address that placed it — the same credential
           -- that already reveals the bank details and the pickup code. Without
           -- this the buyer has no QR and the door has nothing to scan.
           'tickets',       coalesce((
             select jsonb_agg(jsonb_build_object(
                      'publicId', tk.public_id,
                      'serial',   tk.serial,
                      'type',     tk.ticket_type_name,
                      'state',    tk.state,
                      'usedAt',   tk.used_at,
                      'eventName', tk.event_name,
                      'eventStartsAt', tk.event_starts_at)
                    order by tk.serial)
             from tickets tk where tk.order_id = o.id), '[]'::jsonb),
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

do $$
declare v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='lookup_order';
  -- Every key an existing caller depends on must still be built.
  if position('pickupCode' in v_src) = 0 then raise exception 'M56: lookup_order lost pickupCode (M28)'; end if;
  if position('requireReceipt' in v_src) = 0 then raise exception 'M56: lookup_order lost the bank block (M21)'; end if;
  if position('isFood' in v_src) = 0 then raise exception 'M56: lookup_order lost isFood (M55)'; end if;
  if position('canReview' in v_src) = 0 then raise exception 'M56: lookup_order lost canReview (M29)'; end if;
  if position('publicId' in v_src) = 0 then raise exception 'M56: lookup_order did not gain tickets'; end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='redeem_ticket';
  if position('for update' in v_src) = 0 then
    raise exception 'M56: redeem_ticket lost its row lock — double admission becomes possible'; end if;
  if position('can_manage_event' in v_src) = 0 then
    raise exception 'M56: redeem_ticket lost its gate'; end if;
end;
$$;
