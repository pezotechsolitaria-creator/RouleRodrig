-- M35 — Tickets. The only genuinely new primitive in the whole design.
--
-- ── WHY THIS ONE CANNOT BE REUSED ───────────────────────────────────────────
-- M33 made an event a store and M34 made a ticket type a product variant,
-- because in both cases an existing primitive already did the job. This table
-- exists because no existing one does.
--
-- An order line is FUNGIBLE: "3 × Regular" is a quantity. Three bottles of rum
-- are not three identities — nobody asks which bottle.
--
-- A ticket is SERIALIZED: each admission is an individual credential that is
-- checked in exactly once, can be voided on its own, can be held by a different
-- person than the buyer, and has to be presentable at a gate. "3 × Regular"
-- must become three rows with three identities.
--
-- That difference is the entire justification for this table, and it is the
-- only place in T1 where a new primitive was warranted.
--
-- ── THREE STATES, NOT THIRTEEN ──────────────────────────────────────────────
--   valid → not yet admitted
--   used  → admitted, once
--   void  → revoked (refund, cancellation, or a manual revoke), with a reason
--
-- Payment state stays on orders/payments. Money and admission are different
-- questions and the gate must never need to understand the first one: at 11pm
-- with a queue, on a cheap Android, the scanner's whole decision is "is this
-- signature real, is it for this event, is it still valid". Every extra state
-- would land in that decision table.
--
-- TRANSFER is deliberately NOT a state. A transferred ticket is still `valid`;
-- only the holder changed. That becomes a ticket_transfers row later.
--
-- ── R3: THE SNAPSHOT ────────────────────────────────────────────────────────
-- order_items already snapshots product_name and unit_price so that renaming a
-- product cannot rewrite an old receipt. A ticket needs the same protection for
-- the EVENT: rename "Sega Night" to "Sega Night 2027", move the date, and every
-- previously-issued ticket would otherwise silently describe an event that
-- never happened. You cannot backfill a snapshot you never took, so it is taken
-- at issuance and never updated.

create table if not exists tickets (
  id            uuid primary key default gen_random_uuid(),

  -- What was bought. order_item carries the price and quantity; the store IS
  -- the event (M33), denormalised here so the scanner can filter by event
  -- without joining three tables on every scan.
  order_item_id uuid not null references order_items(id) on delete cascade,
  order_id      uuid not null references orders(id) on delete cascade,
  store_id      uuid not null references stores(id) on delete cascade,
  variant_id    uuid references product_variants(id) on delete set null,

  -- 1..N within the order item. Human-facing ("ticket 2 of 3") and what makes
  -- the uniqueness constraint below expressible.
  serial        integer not null check (serial >= 1),

  -- THE PUBLIC IDENTIFIER, and deliberately NOT the primary key.
  --
  -- This is what goes in the QR. Keeping it separate from `id` means the value
  -- printed on thousands of tickets is not the same value used as a foreign key
  -- throughout the database — so it can be rotated if a batch ever leaks,
  -- without rewriting every reference to that row.
  public_id     uuid not null default gen_random_uuid(),

  state         text not null default 'valid' check (state in ('valid','used','void')),
  void_reason   text,

  -- How this ticket came to exist. `complimentary` and `box_office` are the
  -- reason the model does not assume every ticket was paid for online — a
  -- sponsor pass and a cash sale at the door are both first-class.
  source        text not null default 'purchase'
                check (source in ('purchase','box_office','complimentary')),

  -- Who is coming, which is not necessarily who paid. Nullable because a walk-up
  -- cash buyer at the door often gives no details, and demanding them would slow
  -- the queue for no benefit.
  holder_name   text,
  holder_email  text,

  -- R3 snapshots — written once at issuance, never updated.
  event_name       text not null,
  event_starts_at  timestamptz not null,
  ticket_type_name text not null,
  price_paid       integer not null check (price_paid >= 0),

  issued_at     timestamptz not null default now(),
  used_at       timestamptz,
  created_at    timestamptz not null default now(),

  -- One row per admission per line. This is what makes issuance idempotent: a
  -- second attempt to issue the same order collides instead of doubling the
  -- tickets.
  constraint tickets_serial_unique unique (order_item_id, serial),
  -- A used ticket must record WHEN, and an unused one must not pretend to.
  constraint tickets_used_has_time check (
    (state = 'used' and used_at is not null) or (state <> 'used' and used_at is null)
  ),
  constraint tickets_void_has_reason check (state <> 'void' or void_reason is not null)
);

comment on table tickets is
  'One serialized admission credential per seat. The ONLY new primitive in T1: an order line is fungible (3 bottles of rum are not 3 identities) but a ticket is an individual credential checked in exactly once. States are valid|used|void — payment state stays on orders, so a gate scanner never needs to understand money (M35).';
comment on column tickets.public_id is
  'The identifier that goes in the QR. Deliberately NOT the primary key: the value printed on thousands of tickets should not be the same value used as a foreign key everywhere, so a leaked batch can be rotated without rewriting references.';
comment on column tickets.event_name is
  'Snapshot at issuance, never updated (R3). Renaming an event or moving its date must not rewrite what somebody already bought — and a snapshot cannot be backfilled after the fact.';

create unique index if not exists tickets_public_id_key on tickets (public_id);
-- The scanner's query: "this event, this credential".
create index if not exists tickets_store_state_idx on tickets (store_id, state);
create index if not exists tickets_order_idx on tickets (order_id);

-- ── Issuance ────────────────────────────────────────────────────────────────
-- Called when an order first reaches `paid`. Idempotent by construction: the
-- unique (order_item_id, serial) constraint means a repeat call inserts nothing
-- rather than doubling somebody's tickets, so paid → preparing → paid is safe.
--
-- Only order items whose variant IS a ticket type produce tickets. A marketplace
-- order passes through untouched.
create or replace function public.issue_order_tickets(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_item record;
  v_n integer;
  v_issued integer := 0;
begin
  for v_item in
    select oi.id, oi.order_id, oi.variant_id, oi.quantity, oi.unit_price,
           oi.product_name, oi.variant_name,
           o.store_id, o.customer_name, o.customer_email,
           e.starts_at, s.name as store_name
      from order_items oi
      join orders o  on o.id = oi.order_id
      join stores s  on s.id = o.store_id
      join events e  on e.store_id = o.store_id
      -- The gate that keeps marketplace orders out: no ticket_types row, no
      -- tickets.
      join ticket_types tt on tt.variant_id = oi.variant_id
     where oi.order_id = p_order_id
  loop
    for v_n in 1..v_item.quantity loop
      insert into tickets (
        order_item_id, order_id, store_id, variant_id, serial,
        holder_name, holder_email,
        event_name, event_starts_at, ticket_type_name, price_paid, source)
      values (
        v_item.id, v_item.order_id, v_item.store_id, v_item.variant_id, v_n,
        v_item.customer_name, v_item.customer_email,
        v_item.store_name, v_item.starts_at,
        coalesce(nullif(btrim(v_item.variant_name), ''), v_item.product_name),
        v_item.unit_price, 'purchase')
      on conflict on constraint tickets_serial_unique do nothing;

      if found then v_issued := v_issued + 1; end if;
    end loop;
  end loop;

  return v_issued;
end;
$function$;

revoke all on function public.issue_order_tickets(uuid) from public, anon, authenticated;
grant execute on function public.issue_order_tickets(uuid) to service_role;

comment on function public.issue_order_tickets(uuid) is
  'Creates one ticket per admission for every ticket-type line on an order. Idempotent via the (order_item_id, serial) unique constraint, so a repeated paid transition cannot double-issue. Marketplace orders produce nothing (M35).';

-- ── Lifecycle: issue on paid, void on refund or cancellation ────────────────
-- A separate trigger from the financial one. Same event, different concern —
-- and keeping them apart means a fault in ticket issuance can never roll back
-- the money record, or vice versa.
--
-- S6 from the architecture review: a refunded ticket that still scans as valid
-- is how somebody gets their money back AND gets in.
create or replace function public.sync_tickets_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'paid' then
    perform issue_order_tickets(new.id);

  elsif new.status in ('refunded','cancelled') then
    -- Never delete. A ticket that existed is evidence — of who was admitted, of
    -- what was sold — and deleting it would destroy the audit trail the gate
    -- ledger depends on. Voiding stops it scanning; the row stays.
    update tickets
       set state = 'void',
           void_reason = coalesce(void_reason,
             case when new.status = 'refunded' then 'order refunded' else 'order cancelled' end)
     where order_id = new.id
       -- A ticket already USED is left alone: the person came in. Voiding it
       -- would rewrite attendance history to match a later refund.
       and state = 'valid';
  end if;

  return new;
end;
$function$;

revoke all on function public.sync_tickets_lifecycle() from public, anon, authenticated;

drop trigger if exists orders_sync_tickets on orders;
create trigger orders_sync_tickets
  after update of status on orders
  for each row execute function sync_tickets_lifecycle();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table tickets enable row level security;

-- Event staff (scanning, box office, organiser) see their own event's tickets.
drop policy if exists tickets_staff_read on tickets;
create policy tickets_staff_read on tickets
  for select to authenticated
  using (is_store_staff(store_id) or is_platform_admin());

-- A signed-in buyer sees the tickets on their own orders. Guests reach theirs
-- through lookup_order(), which is SECURITY DEFINER and service_role only —
-- the same credential (order number + email) as everything else on the guest
-- tracking page.
drop policy if exists tickets_customer_read on tickets;
create policy tickets_customer_read on tickets
  for select to authenticated
  using (exists (
    select 1 from orders o where o.id = tickets.order_id and o.customer_id = auth.uid()
  ));

revoke all on tickets from anon, authenticated;
grant select on tickets to authenticated;
-- NO client writes at all. Tickets are created by issue_order_tickets and
-- mutated only by the lifecycle trigger and (later) check-in. A ticket that a
-- client could insert or update is a ticket an attacker can mint.

-- ── Post-conditions ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_tables where tablename='tickets') then
    raise exception 'M35: tickets table missing'; end if;
  if not exists (select 1 from pg_trigger where tgname='orders_sync_tickets' and not tgisinternal) then
    raise exception 'M35: the ticket lifecycle trigger is not attached'; end if;

  -- No client role may mint or alter a ticket.
  if has_table_privilege('authenticated','tickets','INSERT')
     or has_table_privilege('authenticated','tickets','UPDATE')
     or has_table_privilege('authenticated','tickets','DELETE') then
    raise exception 'M35: a client role can write tickets'; end if;
  if has_table_privilege('anon','tickets','SELECT') then
    raise exception 'M35: anon can read tickets'; end if;
  if has_function_privilege('authenticated','public.issue_order_tickets(uuid)','EXECUTE') then
    raise exception 'M35: authenticated can issue tickets directly'; end if;

  -- Checkout must be untouched by this migration.
  if position('for update of v' in
       (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and p.proname='create_order')) = 0 then
    raise exception 'M35: the stock row lock vanished from create_order'; end if;
end;
$$;
