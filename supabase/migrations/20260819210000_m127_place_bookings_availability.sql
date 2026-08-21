-- ── STAYS AND EXPERIENCES GET THE VEHICLE'S AVAILABILITY STEP (M127) ───────
--
-- The owner: "do like for vehicle, add a new step like AVAILABILITY then I
-- confirm in the admin dashboard and if available they go to the payment step,
-- if not send customers emails and propose them other suggestions."
--
-- M91 did exactly this for vehicles and the reasoning carries over unchanged:
-- the boats, the therapist and the guesthouses are not his. Confirming a
-- charter he cannot actually get means taking money and giving it back, and a
-- refund costs the PayPal fee, the exchange spread and the customer's trust.
--
-- ── THE SAME COLLISION M91 HAD TO SOLVE ────────────────────────────────────
--
-- An unpaid request must hold nothing, or a stranger could block every boat on
-- the island with free requests. But if APPROVAL holds nothing either, the
-- owner can tell three customers "yes, it's free on Tuesday" and two of them
-- pay for the same slot — more involuntary refunds, caused by the very step
-- meant to prevent them.
--
-- So approval itself becomes the reservation, and because an approved-but-
-- unpaid booking now blocks other customers it cannot be open-ended: it
-- carries a deadline, after which it is released. That deadline is DISCLOSED
-- to the customer in the approval email — a deadline they cannot see is a
-- trap, not a policy, which is the whole lesson of the silent 48h auto-cancel.
--
-- ── THE LIFECYCLE ──────────────────────────────────────────────────────────
--
--   pending      request received, availability NOT yet checked. Holds nothing.
--   approved     the owner confirmed with the partner. RESERVES the slot until
--                payment_due_by. The customer may now pay.
--   confirmed    paid.
--   unavailable  the owner could not get it. Holds nothing, and carries the
--                note the customer is emailed, with alternatives.
--   cancelled    withdrawn by either side.
--   completed    the guest has been and gone.

alter table public.place_bookings
  add column if not exists payment_due_by timestamptz,
  -- What the owner types when declining: "fully booked Tuesday, but Arnaud has
  -- Thursday free". It goes into the customer's email verbatim, so it is copy,
  -- not an internal code.
  add column if not exists unavailable_note text,
  add column if not exists availability_checked_at timestamptz;

comment on column public.place_bookings.payment_due_by is
  'M127. When an approved-but-unpaid booking stops reserving the slot. Disclosed to the customer in the approval email - never a silent deadline.';
comment on column public.place_bookings.unavailable_note is
  'M127. The owner own words when declining, emailed to the customer with alternatives.';

-- The status column was free text with no constraint, and the admin PATCH set
-- whatever it was handed. A typo ("aproved") would have created a booking in a
-- state nothing understands, holding nothing and visible on no screen.
do $$
begin
  if not exists (
    select 1 from pg_constraint con join pg_class c on c.oid = con.conrelid
     where c.relname = 'place_bookings' and con.conname = 'place_bookings_status_check'
  ) then
    alter table public.place_bookings
      add constraint place_bookings_status_check
      check (status in ('pending','approved','confirmed','unavailable','cancelled','completed'));
  end if;
end $$;

-- An approved booking without a deadline would reserve the slot forever, which
-- is the failure this whole design exists to prevent. Enforced, not assumed.
do $$
begin
  if not exists (
    select 1 from pg_constraint con join pg_class c on c.oid = con.conrelid
     where c.relname = 'place_bookings' and con.conname = 'place_bookings_approved_has_deadline'
  ) then
    alter table public.place_bookings
      add constraint place_bookings_approved_has_deadline
      check (status <> 'approved' or payment_due_by is not null);
  end if;
end $$;

-- Finding what is waiting on the owner, and what has run out of time, are the
-- two queries this table will now serve constantly.
create index if not exists place_bookings_status_created_idx
  on public.place_bookings (status, created_at desc);
create index if not exists place_bookings_payment_due_idx
  on public.place_bookings (payment_due_by)
  where payment_due_by is not null;

-- Prove the shape rather than assume the ALTERs took.
do $$
declare missing text;
begin
  select string_agg(c, ', ') into missing from unnest(
    array['payment_due_by','unavailable_note','availability_checked_at']) c
   where not exists (
     select 1 from information_schema.columns
      where table_schema='public' and table_name='place_bookings' and column_name=c);
  if missing is not null then
    raise exception 'place_bookings is missing: %', missing;
  end if;
end $$;
