-- ── M240 (2/2): THE RESERVATION ENGINE — THE ONLY DOORS ─────────────────────
--
-- Every state change goes through a function here, and every function checks
-- the transition map FIRST: the server is the authority, the UI only hides
-- buttons. The maps are mirrored in lib/reservations/status.ts and a test
-- (lib/reservations/sql-parity.test.ts) keeps the two identical.
--
--   GUEST  (anon/authenticated, by raw access token — hashed here):
--     reservation_view, reservation_guest_answer,
--     reservation_guest_report_payment, reservation_guest_choose_cash,
--     reservation_guest_message_opened
--   SERVER (service_role only):
--     reservation_create, reservation_admin, reservation_expire_due
--
-- A guest function never returns the phone, the email or admin notes, and a
-- booking reference alone opens nothing.

-- ── The maps ────────────────────────────────────────────────────────────────
create or replace function public.rsv_can(p_from text, p_to text)
returns boolean language sql immutable set search_path to 'public', 'pg_temp' as $$
  select (p_from, p_to) in (
    ('draft', 'requested'), ('draft', 'cancelled'),
    ('requested', 'under_review'), ('requested', 'needs_information'), ('requested', 'declined'), ('requested', 'expired'), ('requested', 'cancelled'),
    ('under_review', 'confirmed'), ('under_review', 'needs_information'), ('under_review', 'declined'), ('under_review', 'expired'), ('under_review', 'cancelled'),
    ('needs_information', 'under_review'), ('needs_information', 'declined'), ('needs_information', 'expired'), ('needs_information', 'cancelled'),
    ('confirmed', 'ready'), ('confirmed', 'cancelled'), ('confirmed', 'expired'),
    ('ready', 'in_progress'), ('ready', 'cancelled'),
    ('in_progress', 'completed')
  );
$$;

create or replace function public.rsv_pay_can(p_from text, p_to text)
returns boolean language sql immutable set search_path to 'public', 'pg_temp' as $$
  select (p_from, p_to) in (
    ('unpaid', 'payment_pending'), ('unpaid', 'pay_in_person'), ('unpaid', 'waived'), ('unpaid', 'not_required'),
    ('payment_pending', 'paid'), ('payment_pending', 'partially_paid'), ('payment_pending', 'pay_in_person'), ('payment_pending', 'failed'), ('payment_pending', 'unpaid'), ('payment_pending', 'waived'),
    ('partially_paid', 'paid'), ('partially_paid', 'pay_in_person'), ('partially_paid', 'refunded'),
    ('pay_in_person', 'paid'), ('pay_in_person', 'payment_pending'), ('pay_in_person', 'waived'),
    ('paid', 'refunded'),
    ('failed', 'payment_pending'), ('failed', 'unpaid')
  );
$$;

-- ── Small helpers (not granted) ─────────────────────────────────────────────
create or replace function public.rsv_event(p_id uuid, p_actor text, p_label text, p_type text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path to 'public', 'pg_temp' as $$
  insert into reservation_events (reservation_id, actor, actor_label, type, payload)
  values (p_id, p_actor, p_label, p_type, coalesce(p_payload, '{}'::jsonb));
$$;

/** Queue a guest message: email when we have an address, else on the page only. */
create or replace function public.rsv_notify_guest(p_r public.reservations, p_template text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path to 'public', 'pg_temp' as $$
  insert into reservation_outbox (reservation_id, audience, channel, template, payload, status)
  values (p_r.id, 'guest', case when p_r.customer_email is not null then 'email' else 'in_app' end, p_template,
          coalesce(p_payload, '{}'::jsonb), case when p_r.customer_email is not null then 'pending' else 'skipped' end);
$$;

create or replace function public.rsv_notify_admin(p_r public.reservations, p_template text, p_payload jsonb default '{}'::jsonb)
returns void language sql security definer set search_path to 'public', 'pg_temp' as $$
  insert into reservation_outbox (reservation_id, audience, channel, template, payload)
  values (p_r.id, 'admin', 'email', p_template, coalesce(p_payload, '{}'::jsonb));
$$;

/** A fresh RR-XXXXX, Crockford base32 without I L O U, unused. */
create or replace function public.rsv_new_reference()
returns text language plpgsql volatile set search_path to 'public', 'pg_temp' as $$
declare
  v_alpha constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes bytea;
  v_ref text;
begin
  for attempt in 1..20 loop
    v_bytes := extensions.gen_random_bytes(5);
    v_ref := 'RR-';
    for i in 0..4 loop
      v_ref := v_ref || substr(v_alpha, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    if not exists (select 1 from reservations where booking_reference = v_ref) then
      return v_ref;
    end if;
  end loop;
  raise exception 'could not allocate a booking reference';
end $$;

/**
 * Seats already HELD for a product on a slot (or, for a date range, the
 * fullest night in it): confirmed / ready / in-progress reservations, plus
 * the older place_bookings the owner has approved or confirmed — so the two
 * systems can never sell the same seat twice while both exist.
 */
create or replace function public.rsv_seats_taken(p_product text, p_from date, p_to date, p_slot_key text, p_exclude uuid)
returns int language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_max int := 0;
  v_n int;
  v_time text := nullif(split_part(p_slot_key, '@', 2), '');
  v_last date := coalesce(p_to, p_from);
  d date;
begin
  if p_to is null or p_to = p_from then
    -- One date (and maybe a time): count that slot.
    select coalesce(sum(r.seats), 0) into v_n
      from reservations r
     where r.product_id = p_product
       and r.reservation_status in ('confirmed', 'ready', 'in_progress')
       and r.slot_key = p_slot_key
       and r.id is distinct from p_exclude;
    select v_n + coalesce(sum(coalesce(b.quantity, 1)), 0) into v_n
      from place_bookings b
     where b.place_id = p_product
       and b.status in ('approved', 'confirmed')
       and b.start_date = p_from
       and (v_time is null or b.time_slot is null or b.time_slot = v_time);
    return v_n;
  end if;
  -- A range: nights [from, to). The fullest night decides.
  for d in select generate_series(p_from, v_last - 1, interval '1 day')::date loop
    select coalesce(sum(r.seats), 0) into v_n
      from reservations r
     where r.product_id = p_product
       and r.reservation_status in ('confirmed', 'ready', 'in_progress')
       and r.id is distinct from p_exclude
       and r.slot_date <= d and coalesce(r.slot_end_date, r.slot_date + 1) > d;
    select v_n + coalesce(sum(coalesce(b.quantity, 1)), 0) into v_n
      from place_bookings b
     where b.place_id = p_product
       and b.status in ('approved', 'confirmed')
       and b.start_date <= d and coalesce(b.end_date, b.start_date + 1) > d;
    v_max := greatest(v_max, v_n);
  end loop;
  return v_max;
end $$;

/** Expire one reservation now (the caller has checked it is due). */
create or replace function public.rsv_expire_one(p_r public.reservations)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
begin
  update reservations
     set reservation_status = 'expired',
         payment_status = case when payment_status in ('payment_pending', 'failed') then 'unpaid' else payment_status end,
         expired_at = now(), updated_at = now()
   where id = p_r.id;
  perform rsv_event(p_r.id, 'system', 'deadline', 'expired', jsonb_build_object('deadline', p_r.payment_deadline_at));
  perform rsv_notify_guest(p_r, 'expired');
end $$;

create or replace function public.rsv_is_due(p_r public.reservations)
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $$
  select p_r.reservation_status = 'confirmed'
     and p_r.payment_status in ('unpaid', 'payment_pending', 'failed')
     and p_r.payment_deadline_at is not null
     and p_r.payment_deadline_at <= now();
$$;

/** What a guest may see of their own reservation. Never phone, email or admin notes. */
create or replace function public.rsv_guest_view(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'reference', r.booking_reference,
    'status', r.reservation_status,
    'paymentStatus', r.payment_status,
    'paymentMethod', r.payment_method,
    'paymentReportedAt', r.payment_reported_at,
    'paymentReportedMethod', r.payment_reported_method,
    'customerName', r.customer_name,
    'locale', r.customer_locale,
    'productId', r.product_id,
    'productType', r.product_type,
    'product', r.product_snapshot,
    'slot', r.slot,
    'party', r.party,
    'seats', r.seats,
    'slotDate', r.slot_date,
    'slotEndDate', r.slot_end_date,
    'amountMur', r.amount_mur,
    'depositDueMur', r.deposit_due_mur,
    'balanceDueMur', r.balance_due_mur,
    'amountPaidMur', r.amount_paid_mur,
    'paymentDeadlineAt', r.payment_deadline_at,
    'policy', jsonb_build_object('mode', r.payment_policy_snapshot->>'mode'),
    'declineReason', case when r.reservation_status = 'declined' then r.decline_reason end,
    'requestedAt', r.requested_at,
    'confirmedAt', r.confirmed_at,
    'paidAt', r.paid_at,
    'infoRequest', (select jsonb_build_object('fields', i.fields, 'note', i.note, 'askedAt', i.asked_at)
                      from reservation_info_requests i
                     where i.reservation_id = r.id and i.answered_at is null
                     order by i.asked_at desc limit 1),
    -- Only once money is due: the policy's methods that the owner has
    -- switched on, with their instructions.
    'methods', case when r.reservation_status = 'confirmed' and r.payment_status in ('payment_pending', 'partially_paid', 'failed') then (
        select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'channel', m.channel, 'label', m.label_i18n, 'instructions', m.instructions_i18n) order by m.sort), '[]'::jsonb)
          from reservation_payment_methods m
         where m.enabled
           and m.id <> 'card'
           and (r.payment_policy_snapshot->'allowed_methods') ? m.id)
      else '[]'::jsonb end,
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'type', e.type) order by e.at), '[]'::jsonb)
                 from reservation_events e
                where e.reservation_id = r.id
                  and e.type in ('submitted', 'review_started', 'info_requested', 'info_received', 'confirmed', 'payment_reported',
                                 'payment_recorded', 'pay_in_person', 'ready', 'started', 'completed', 'declined', 'expired', 'cancelled')),
    'messages', (select coalesce(jsonb_agg(jsonb_build_object('at', o.created_at, 'template', o.template, 'payload', o.payload) order by o.created_at), '[]'::jsonb)
                   from reservation_outbox o where o.reservation_id = r.id and o.audience = 'guest')
  )
  from reservations r where r.id = p_id;
$$;

create or replace function public.rsv_by_token(p_token text)
returns public.reservations language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select r.* from reservations r
   where p_token ~ '^[A-Za-z0-9_-]{43}$'
     and r.access_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- ── GUEST ───────────────────────────────────────────────────────────────────
create or replace function public.reservation_view(p_token text)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
begin
  r := rsv_by_token(p_token);
  if r.id is null then return null; end if;
  -- A hold whose deadline has passed is expired on sight, even before the
  -- sweep runs: the guest must never be shown "pay now" for a lapsed hold.
  if rsv_is_due(r) then
    perform rsv_expire_one(r);
  end if;
  return rsv_guest_view(r.id);
end $$;

create or replace function public.reservation_guest_answer(p_token text, p_answer jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
  i reservation_info_requests;
  k text;
  clean jsonb := '{}'::jsonb;
begin
  r := rsv_by_token(p_token);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if not rsv_can(r.reservation_status, 'under_review') or r.reservation_status <> 'needs_information' then
    return jsonb_build_object('ok', false, 'error', 'not_asked');
  end if;
  select * into i from reservation_info_requests
   where reservation_id = r.id and answered_at is null order by asked_at desc limit 1;
  if i.id is null then return jsonb_build_object('ok', false, 'error', 'not_asked'); end if;
  -- Only the fields that were asked, each a short line of text.
  foreach k in array i.fields loop
    if p_answer ? k and length(btrim(p_answer->>k)) > 0 then
      clean := clean || jsonb_build_object(k, left(btrim(p_answer->>k), 300));
    end if;
  end loop;
  if clean = '{}'::jsonb then return jsonb_build_object('ok', false, 'error', 'empty'); end if;
  update reservation_info_requests set answered_at = now(), answer = clean where id = i.id;
  update reservations set reservation_status = 'under_review', reviewed_at = coalesce(reviewed_at, now()), updated_at = now() where id = r.id;
  perform rsv_event(r.id, 'customer', r.customer_name, 'info_received', jsonb_build_object('fields', i.fields));
  perform rsv_notify_admin(r, 'info_received', jsonb_build_object('answer', clean));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.reservation_guest_report_payment(p_token text, p_method text)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
begin
  r := rsv_by_token(p_token);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if rsv_is_due(r) then perform rsv_expire_one(r); return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if r.reservation_status <> 'confirmed' or r.payment_status not in ('payment_pending', 'partially_paid', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'not_payable');
  end if;
  -- A REPORT, for the admin to check. It never marks anything paid.
  if p_method not in ('mcb_juice', 'bank_transfer')
     or not ((r.payment_policy_snapshot->'allowed_methods') ? p_method)
     or not exists (select 1 from reservation_payment_methods m where m.id = p_method and m.enabled) then
    return jsonb_build_object('ok', false, 'error', 'method');
  end if;
  update reservations set payment_reported_at = now(), payment_reported_method = p_method, updated_at = now() where id = r.id;
  perform rsv_event(r.id, 'customer', r.customer_name, 'payment_reported', jsonb_build_object('method', p_method));
  perform rsv_notify_admin(r, 'payment_reported', jsonb_build_object('method', p_method));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.reservation_guest_choose_cash(p_token text)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
begin
  r := rsv_by_token(p_token);
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if rsv_is_due(r) then perform rsv_expire_one(r); return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  if r.reservation_status <> 'confirmed' or r.payment_status <> 'payment_pending' then
    return jsonb_build_object('ok', false, 'error', 'not_payable');
  end if;
  -- Only where the OWNER allows cash for this product (policy) and has the
  -- method switched on. The guest's choice alone never overrides a
  -- pay-online policy.
  if not ((r.payment_policy_snapshot->'allowed_methods') ? 'cash_in_person')
     or not exists (select 1 from reservation_payment_methods m where m.id = 'cash_in_person' and m.enabled) then
    return jsonb_build_object('ok', false, 'error', 'method');
  end if;
  if not rsv_pay_can(r.payment_status, 'pay_in_person') then return jsonb_build_object('ok', false, 'error', 'not_payable'); end if;
  update reservations set payment_status = 'pay_in_person', payment_method = 'cash_in_person', updated_at = now() where id = r.id;
  perform rsv_event(r.id, 'customer', r.customer_name, 'pay_in_person', '{}'::jsonb);
  perform rsv_notify_admin(r, 'cash_chosen');
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.reservation_guest_message_opened(p_token text)
returns void language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
begin
  r := rsv_by_token(p_token);
  if r.id is null then return; end if;
  -- One row per hour at most: a guest tapping WhatsApp twice is one event.
  if exists (select 1 from reservation_events e where e.reservation_id = r.id and e.type = 'message_opened' and e.at > now() - interval '1 hour') then
    return;
  end if;
  perform rsv_event(r.id, 'customer', r.customer_name, 'message_opened', '{}'::jsonb);
end $$;

-- ── SERVER: create ──────────────────────────────────────────────────────────
-- The route computes the price from the listing (never the browser) and the
-- token from the idempotency key; a repeated key returns the SAME row.
create or replace function public.reservation_create(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_existing reservations;
  r reservations;
  v_policy jsonb := p->'policy';
  v_mode text := coalesce(p->'policy'->>'mode', 'full');
begin
  select * into v_existing from reservations where idempotency_key = p->>'idempotency_key';
  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'existing', true, 'id', v_existing.id, 'reference', v_existing.booking_reference);
  end if;

  insert into reservations (
    booking_reference, access_token_hash, idempotency_key,
    customer_name, customer_phone, customer_email, customer_locale, customer_id,
    product_id, product_type, product_snapshot, slot, party, seats, slot_date, slot_end_date, slot_key,
    amount_mur, deposit_due_mur, balance_due_mur,
    reservation_status, payment_status, payment_policy_snapshot, customer_notes, source
  ) values (
    rsv_new_reference(), p->>'token_hash', p->>'idempotency_key',
    btrim(p->>'customer_name'), btrim(p->>'customer_phone'), nullif(lower(btrim(p->>'customer_email')), ''),
    coalesce(p->>'customer_locale', 'en'), nullif(p->>'customer_id', '')::uuid,
    p->>'product_id', p->>'product_type', p->'product_snapshot', p->'slot',
    coalesce(p->'party', '{"adults": 1, "children": 0, "babies": 0}'::jsonb), coalesce((p->>'seats')::int, 1),
    (p->>'slot_date')::date, nullif(p->>'slot_end_date', '')::date, p->>'slot_key',
    nullif(p->>'amount_mur', '')::int, nullif(p->>'deposit_due_mur', '')::int, nullif(p->>'balance_due_mur', '')::int,
    'requested', case when v_mode = 'none' then 'not_required' else 'unpaid' end,
    v_policy, nullif(left(btrim(coalesce(p->>'customer_notes', '')), 1000), ''), coalesce(p->>'source', 'web')
  )
  on conflict (idempotency_key) do nothing
  returning * into r;

  if r.id is null then
    -- Lost a race with the same key: return the winner.
    select * into r from reservations where idempotency_key = p->>'idempotency_key';
    return jsonb_build_object('ok', true, 'existing', true, 'id', r.id, 'reference', r.booking_reference);
  end if;

  perform rsv_event(r.id, 'customer', r.customer_name, 'submitted', jsonb_build_object('source', r.source));
  perform rsv_notify_guest(r, 'submitted');
  perform rsv_notify_admin(r, 'new_request');
  return jsonb_build_object('ok', true, 'existing', false, 'id', r.id, 'reference', r.booking_reference);
end $$;

-- ── SERVER: admin actions ───────────────────────────────────────────────────
create or replace function public.reservation_admin(p_id uuid, p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
  v_label text := coalesce(nullif(p->>'actor_label', ''), 'Roulé');
  v_actor text := case when p->>'actor' = 'system' then 'system' else 'admin' end;
  v_cap int;
  v_taken int;
  v_amount int;
  v_due int;
  v_hours int;
  v_paystatus text;
  v_method text;
  v_paid int;
  v_fields text[];
  v_to text;
begin
  select * into r from reservations where id = p_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  if p_action = 'review' then
    if not rsv_can(r.reservation_status, 'under_review') or r.reservation_status <> 'requested' then
      return jsonb_build_object('ok', false, 'error', 'illegal', 'from', r.reservation_status);
    end if;
    update reservations set reservation_status = 'under_review', reviewed_at = now(), updated_at = now() where id = r.id;
    perform rsv_event(r.id, v_actor, v_label, 'review_started');
    return jsonb_build_object('ok', true);

  elsif p_action = 'confirm' then
    -- A request is reviewed on the way to confirmed (both legal moves).
    if r.reservation_status = 'requested' then
      update reservations set reservation_status = 'under_review', reviewed_at = now() where id = r.id;
      perform rsv_event(r.id, v_actor, v_label, 'review_started');
      r.reservation_status := 'under_review';
    end if;
    if not rsv_can(r.reservation_status, 'confirmed') then
      return jsonb_build_object('ok', false, 'error', 'illegal', 'from', r.reservation_status);
    end if;

    -- ── Capacity: the lock that makes "two confirms on the last seat" safe ──
    -- One confirm per product at a time; the second waits, then counts the
    -- first one's seats.
    perform pg_advisory_xact_lock(hashtextextended('rsv:' || r.product_id, 0));
    v_cap := coalesce(nullif(p->>'capacity', '')::int, nullif(r.product_snapshot->>'capacity', '')::int, 1);
    v_taken := rsv_seats_taken(r.product_id, r.slot_date, r.slot_end_date, r.slot_key, r.id);
    if v_taken + r.seats > v_cap then
      return jsonb_build_object('ok', false, 'error', 'conflict', 'taken', v_taken, 'capacity', v_cap, 'seats', r.seats);
    end if;

    -- Money: the price can be set or corrected here (Roulé quotes on confirm
    -- when the listing had none). Confirm NEVER sets paid.
    v_amount := coalesce(nullif(p->>'amount_mur', '')::int, r.amount_mur);
    v_due := coalesce(nullif(p->>'deposit_due_mur', '')::int, r.deposit_due_mur, v_amount);
    if (r.payment_policy_snapshot->>'mode') in ('none') or v_amount = 0 then
      v_paystatus := 'not_required';
    elsif (r.payment_policy_snapshot->>'mode') = 'pay_at_pickup' or v_due = 0 then
      v_paystatus := 'pay_in_person';
    elsif v_amount is null then
      return jsonb_build_object('ok', false, 'error', 'amount_required');
    else
      v_paystatus := 'payment_pending';
    end if;
    if r.payment_status <> v_paystatus and not rsv_pay_can(r.payment_status, v_paystatus) then
      return jsonb_build_object('ok', false, 'error', 'illegal_payment', 'from', r.payment_status, 'to', v_paystatus);
    end if;
    v_hours := coalesce(nullif(p->>'deadline_hours', '')::int, nullif(r.payment_policy_snapshot->>'deadline_hours', '')::int, 24);
    v_hours := least(greatest(v_hours, 1), 24 * 14);

    update reservations
       set reservation_status = 'confirmed',
           confirmed_at = now(),
           amount_mur = v_amount,
           deposit_due_mur = v_due,
           balance_due_mur = coalesce(nullif(p->>'balance_due_mur', '')::int, greatest(coalesce(v_amount, 0) - coalesce(v_due, 0), 0)),
           payment_status = v_paystatus,
           payment_method = case when v_paystatus = 'pay_in_person' then 'cash_in_person' else payment_method end,
           payment_deadline_at = case when v_paystatus = 'payment_pending' then now() + make_interval(hours => v_hours) else null end,
           updated_at = now()
     where id = r.id
     returning * into r;
    perform rsv_event(r.id, v_actor, v_label, 'confirmed', jsonb_build_object('amount_mur', v_amount, 'payment', v_paystatus, 'capacity', v_cap, 'taken', v_taken));
    if v_paystatus = 'payment_pending' then
      perform rsv_event(r.id, 'system', 'policy', 'payment_link_ready', jsonb_build_object('deadline', r.payment_deadline_at));
      perform rsv_notify_guest(r, 'confirmed', jsonb_build_object('deadline', r.payment_deadline_at));
    else
      perform rsv_notify_guest(r, 'confirmed_in_person');
    end if;
    return jsonb_build_object('ok', true, 'payment', v_paystatus, 'deadline', r.payment_deadline_at);

  elsif p_action = 'request_info' then
    if r.reservation_status not in ('requested', 'under_review') or not rsv_can(r.reservation_status, 'needs_information') then
      return jsonb_build_object('ok', false, 'error', 'illegal', 'from', r.reservation_status);
    end if;
    select array_agg(f) into v_fields
      from jsonb_array_elements_text(coalesce(p->'fields', '[]'::jsonb)) f
     where f in ('pickup_time', 'flight_number', 'passengers', 'driver_name', 'meeting_point', 'hotel', 'other');
    if v_fields is null or cardinality(v_fields) = 0 then return jsonb_build_object('ok', false, 'error', 'fields_required'); end if;
    insert into reservation_info_requests (reservation_id, fields, note) values (r.id, v_fields, nullif(left(btrim(coalesce(p->>'note', '')), 500), ''));
    update reservations set reservation_status = 'needs_information', reviewed_at = coalesce(reviewed_at, now()), updated_at = now() where id = r.id;
    perform rsv_event(r.id, v_actor, v_label, 'info_requested', jsonb_build_object('fields', v_fields));
    perform rsv_notify_guest(r, 'needs_info', jsonb_build_object('fields', v_fields));
    return jsonb_build_object('ok', true);

  elsif p_action = 'decline' then
    if length(btrim(coalesce(p->>'reason', ''))) < 3 then return jsonb_build_object('ok', false, 'error', 'reason_required'); end if;
    if not rsv_can(r.reservation_status, 'declined') then
      return jsonb_build_object('ok', false, 'error', 'illegal', 'from', r.reservation_status);
    end if;
    update reservations set reservation_status = 'declined', declined_at = now(), decline_reason = left(btrim(p->>'reason'), 500), updated_at = now() where id = r.id;
    perform rsv_event(r.id, v_actor, v_label, 'declined', jsonb_build_object('reason', left(btrim(p->>'reason'), 500)));
    perform rsv_notify_guest(r, 'declined');
    return jsonb_build_object('ok', true);

  elsif p_action = 'cancel' then
    if not rsv_can(r.reservation_status, 'cancelled') then
      return jsonb_build_object('ok', false, 'error', 'illegal', 'from', r.reservation_status);
    end if;
    update reservations set reservation_status = 'cancelled', cancelled_at = now(), updated_at = now(),
           admin_notes = case when p->>'reason' is not null then left(concat_ws(E'\n', admin_notes, 'Cancelled: ' || btrim(p->>'reason')), 2000) else admin_notes end
     where id = r.id;
    perform rsv_event(r.id, v_actor, v_label, 'cancelled', jsonb_build_object('reason', p->>'reason'));
    perform rsv_notify_guest(r, 'cancelled');
    return jsonb_build_object('ok', true);

  elsif p_action = 'mark_paid' then
    -- Money is recorded only by the owner (Juice, transfer, cash) or by a
    -- verified PayPal capture (actor = system). Never by a guest's tap.
    if r.reservation_status not in ('confirmed', 'ready', 'in_progress') then
      return jsonb_build_object('ok', false, 'error', 'not_confirmed', 'from', r.reservation_status);
    end if;
    v_method := p->>'method';
    if v_method is null or v_method not in ('mcb_juice', 'paypal', 'bank_transfer', 'cash_in_person', 'card') then
      return jsonb_build_object('ok', false, 'error', 'method');
    end if;
    v_amount := nullif(p->>'amount_mur', '')::int;
    if v_amount is null or v_amount <= 0 then return jsonb_build_object('ok', false, 'error', 'amount_required'); end if;
    v_paid := r.amount_paid_mur + v_amount;
    v_due := coalesce(r.deposit_due_mur, r.amount_mur, 0);
    v_paystatus := case when v_paid >= v_due then 'paid' else 'partially_paid' end;
    if r.payment_status <> v_paystatus and not rsv_pay_can(r.payment_status, v_paystatus) then
      return jsonb_build_object('ok', false, 'error', 'illegal_payment', 'from', r.payment_status, 'to', v_paystatus);
    end if;
    insert into booking_payments (booking_kind, booking_id, amount_rupees, method, received_at, note)
    values ('reservation', r.id, v_amount,
            case v_method when 'cash_in_person' then 'cash' else v_method end,
            coalesce(nullif(p->>'received_at', '')::timestamptz, now()),
            nullif(left(concat_ws(' · ', r.booking_reference, nullif(p->>'external_ref', ''), nullif(p->>'note', '')), 300), ''));
    update reservations
       set amount_paid_mur = v_paid,
           payment_status = v_paystatus,
           payment_method = v_method,
           paid_at = case when v_paystatus = 'paid' then now() else paid_at end,
           updated_at = now()
     where id = r.id
     returning * into r;
    perform rsv_event(r.id, v_actor, v_label, 'payment_recorded', jsonb_build_object('method', v_method, 'amount_mur', v_amount, 'external_ref', p->>'external_ref', 'payment', v_paystatus));
    if v_paystatus = 'paid' then perform rsv_notify_guest(r, 'paid'); end if;
    return jsonb_build_object('ok', true, 'payment', v_paystatus, 'paid_mur', v_paid);

  elsif p_action = 'allow_cash' then
    if r.reservation_status <> 'confirmed' or not rsv_pay_can(r.payment_status, 'pay_in_person') then
      return jsonb_build_object('ok', false, 'error', 'illegal_payment', 'from', r.payment_status);
    end if;
    update reservations set payment_status = 'pay_in_person', payment_method = 'cash_in_person', payment_deadline_at = null, updated_at = now() where id = r.id;
    perform rsv_event(r.id, v_actor, v_label, 'pay_in_person');
    perform rsv_notify_guest(r, 'confirmed_in_person');
    return jsonb_build_object('ok', true);

  elsif p_action in ('ready', 'start', 'complete') then
    v_to := case p_action when 'ready' then 'ready' when 'start' then 'in_progress' else 'completed' end;
    if not rsv_can(r.reservation_status, v_to) then
      return jsonb_build_object('ok', false, 'error', 'illegal', 'from', r.reservation_status);
    end if;
    update reservations
       set reservation_status = v_to,
           ready_at = case when v_to = 'ready' then now() else ready_at end,
           started_at = case when v_to = 'in_progress' then now() else started_at end,
           completed_at = case when v_to = 'completed' then now() else completed_at end,
           updated_at = now()
     where id = r.id;
    perform rsv_event(r.id, v_actor, v_label, case v_to when 'ready' then 'ready' when 'in_progress' then 'started' else 'completed' end);
    return jsonb_build_object('ok', true);

  elsif p_action = 'note' then
    update reservations set admin_notes = left(btrim(coalesce(p->>'note', '')), 2000), updated_at = now() where id = r.id;
    perform rsv_event(r.id, v_actor, v_label, 'note');
    return jsonb_build_object('ok', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $$;

-- ── SERVER: the deadline sweep ──────────────────────────────────────────────
-- Run every minute by /api/cron/notifications (pinged externally — the three
-- Vercel cron slots are all taken). Releases the capacity of every confirmed
-- hold whose payment never came; never touches a paid or pay-in-person row.
create or replace function public.reservation_expire_due(p_limit int default 100)
returns jsonb language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $$
declare
  r reservations;
  v_refs text[] := '{}';
begin
  for r in
    select * from reservations
     where reservation_status = 'confirmed'
       and payment_status in ('unpaid', 'payment_pending', 'failed')
       and payment_deadline_at is not null
       and payment_deadline_at <= now()
     order by payment_deadline_at
     limit greatest(p_limit, 0)
     for update skip locked
  loop
    perform rsv_expire_one(r);
    v_refs := v_refs || r.booking_reference;
  end loop;
  return jsonb_build_object('expired', cardinality(v_refs), 'refs', to_jsonb(v_refs));
end $$;

-- ── Grants: guests by token; everything else server-only ────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'rsv_can(text, text)', 'rsv_pay_can(text, text)', 'rsv_event(uuid, text, text, text, jsonb)',
    'rsv_notify_guest(public.reservations, text, jsonb)', 'rsv_notify_admin(public.reservations, text, jsonb)',
    'rsv_new_reference()', 'rsv_seats_taken(text, date, date, text, uuid)', 'rsv_expire_one(public.reservations)',
    'rsv_is_due(public.reservations)', 'rsv_guest_view(uuid)', 'rsv_by_token(text)',
    'reservation_create(jsonb)', 'reservation_admin(uuid, text, jsonb)', 'reservation_expire_due(int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'reservation_view(text)', 'reservation_guest_answer(text, jsonb)', 'reservation_guest_report_payment(text, text)',
    'reservation_guest_choose_cash(text)', 'reservation_guest_message_opened(text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
