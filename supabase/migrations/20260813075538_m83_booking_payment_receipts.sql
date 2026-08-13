-- M83 — Proof of payment reaches the other half of the business.
--
-- Numbered 83, not 82: a parallel branch took M82 for the merchant split
-- payment at the same moment. The filename carries the version this actually
-- applied under (supabase_migrations.schema_migrations records it as
-- 20260813075538, name `m82_booking_payment_receipts`, applied after both of
-- that branch's migrations) so the ledger and the directory agree on ORDER,
-- even though the recorded name kept the number it was applied with.
--
-- The owner: "put the uploaded proof of payment in all services."
--
-- Today a customer who pays by bank transfer can upload the slip for a SHOP or
-- FOOD order (M49, M78) and it lands in /admin. A customer renting a scooter or
-- booking a massage is told, in three languages, to "send us the receipt on
-- WhatsApp" — so the evidence for the two oldest services on the site lives in
-- a chat thread, unattached to the booking, and the owner reconciles by
-- scrolling. Same money, same bank, half the machinery.
--
-- This is deliberately NOT a new mechanism. It reuses, exactly:
--   · the credential — reference + email, via lookup_booking (M11), which
--     already resolves BOTH bookings and place_bookings and already compares
--     the email with case-insensitive equality rather than ILIKE (the hole M11
--     closed: '%' as an email matched every row);
--   · the safety property from M49 — THE OBJECT PATH IS DERIVED FROM THE ID THE
--     DATABASE RESOLVED, NEVER FROM ANYTHING THE CLIENT SENT, so a caller
--     cannot aim an upload at somebody else's folder;
--   · the column names from `orders` (payment_receipt_path,
--     payment_reported_at). M78 was caused by a receipt existing somewhere the
--     admin did not read. Two spellings of the same idea is how that repeats.
--
-- The receipt is never deleted here, for M78's reason: rejecting a payment is
-- the one moment the evidence matters most, because it is the moment somebody
-- disputes it.

-- ── Columns ────────────────────────────────────────────────────────────────
alter table public.bookings
  add column if not exists payment_receipt_path text,
  add column if not exists payment_reported_at  timestamptz;

alter table public.place_bookings
  add column if not exists payment_receipt_path text,
  add column if not exists payment_reported_at  timestamptz;

-- ── Private bucket ─────────────────────────────────────────────────────────
-- Private, and with no storage policies at all: only the service role writes
-- (the guest has no session to authenticate with) and only the service role
-- reads, handing the owner a short-lived signed URL. A bank slip carries an
-- account number and a name; it must never be publicly addressable.
insert into storage.buckets (id, name, public)
values ('booking-receipts', 'booking-receipts', false)
on conflict (id) do nothing;

-- ── Record the declaration ─────────────────────────────────────────────────
--
-- Returns the booking it touched so the caller can tell the customer what was
-- updated without a second round trip. SECURITY DEFINER because the anon role
-- cannot see these tables at all; the credential check below IS the boundary.
create or replace function public.guest_report_booking_payment(
  p_ref           text,
  p_email         text,
  p_receipt_path  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ref   text;
  v_email text;
  v_id    uuid;
  v_kind  text;
begin
  -- Same reduction as lookup_booking and /api/bookings/lookup: hex only, so
  -- '%', '_', '*' and backslash cannot survive into a comparison. Three layers
  -- do this independently and none trusts the others.
  v_ref   := regexp_replace(lower(coalesce(p_ref, '')), '[^0-9a-f]', '', 'g');
  v_email := lower(btrim(coalesce(p_email, '')));

  if length(v_ref) < 6 or v_email = '' then
    raise exception 'Enter your full booking reference and the email you booked with.'
      using errcode = 'RR005';
  end if;
  v_ref := left(v_ref, 6);

  -- Vehicles first, then activities — the order lookup_booking resolves them
  -- in, so a reference means the same booking in both places.
  --
  -- The predicate is character-for-character lookup_booking's. Exact equality
  -- on the first six hex, never LIKE: a pattern operator on caller-derived
  -- input is the shape of the M11 hole, and two spellings of "same booking"
  -- would eventually disagree about which one a receipt belongs to.
  select b.id, 'vehicle' into v_id, v_kind
  from public.bookings b
  where lower(btrim(b.email)) = v_email
    and left(replace(b.id::text, '-', ''), 6) = v_ref
  limit 1;

  if v_id is null then
    select p.id, 'place' into v_id, v_kind
    from public.place_bookings p
    where lower(btrim(p.email)) = v_email
      and left(replace(p.id::text, '-', ''), 6) = v_ref
    limit 1;
  end if;

  if v_id is null then
    -- One message for "no such reference" and "wrong email". Distinguishing
    -- them would turn this into an oracle for which references exist.
    raise exception 'We couldn''t find a booking with that reference and email.'
      using errcode = 'RR003';
  end if;

  -- The caller builds the path from the id THIS function resolved, but re-check
  -- the prefix rather than trust it — a future call site may be less careful.
  if p_receipt_path is not null
     and p_receipt_path not like v_id::text || '/%' then
    raise exception 'Receipt path does not belong to this booking.' using errcode = 'RR005';
  end if;

  if v_kind = 'vehicle' then
    update public.bookings
       set payment_receipt_path = coalesce(nullif(trim(coalesce(p_receipt_path, '')), ''), payment_receipt_path),
           payment_reported_at  = now()
     where id = v_id;
  else
    update public.place_bookings
       set payment_receipt_path = coalesce(nullif(trim(coalesce(p_receipt_path, '')), ''), payment_receipt_path),
           payment_reported_at  = now()
     where id = v_id;
  end if;

  return jsonb_build_object('kind', v_kind, 'id', v_id);
end;
$$;

-- The boundary is the credential inside the function, but this is a
-- SECURITY DEFINER function that writes — it is reachable only by the server.
-- `revoke from public` is the part that actually matters: Postgres grants
-- EXECUTE to PUBLIC by default and anon/authenticated inherit it.
revoke all on function public.guest_report_booking_payment(text, text, text) from public;
revoke all on function public.guest_report_booking_payment(text, text, text) from anon, authenticated;
grant execute on function public.guest_report_booking_payment(text, text, text) to service_role;

comment on function public.guest_report_booking_payment(text, text, text) is
  'M83: a guest declares a bank transfer for a vehicle or activity booking, proven by reference + email. Service role only.';
