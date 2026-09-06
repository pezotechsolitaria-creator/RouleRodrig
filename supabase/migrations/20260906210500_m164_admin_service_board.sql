-- ── The Do It For Me desk ──────────────────────────────────────────────────
--
-- NOT a second copy of /admin/deliveries. That board triages ONE JOB at a time
-- — who is late, who is stuck, which driver to call — and an errand already
-- flows through it correctly. Building a second list of the same rows would
-- have been the third time this project shipped a screen that already existed.
--
-- This answers the question that board cannot: IS THE SERVICE LINE WORKING.
-- A new service fails quietly. Requests come in, no driver answers, the
-- customer waits out the expiry and never comes back — and every individual
-- job looks merely "open" on the operations board while the line dies. So the
-- numbers here are about the FUNNEL and the SILENCE, not about any one row.
create or replace function public.admin_service_board(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with win as (
    select greatest(1, least(coalesce(p_days, 30), 365)) as days
  ),
  r as (
    select dr.*,
           (select count(*) from delivery_quotes q where q.request_id = dr.id) as quote_count,
           (select min(q.fee) from delivery_quotes q
             where q.request_id = dr.id and q.status = 'offered') as best_quote,
           (select min(q.created_at) from delivery_quotes q where q.request_id = dr.id) as first_quote_at
      from delivery_requests dr, win
     where dr.kind = 'errand'
       and dr.created_at > now() - (win.days || ' days')::interval
  )
  select jsonb_build_object(
    'days', (select days from win),

    -- ── What needs somebody right now ───────────────────────────────────
    -- Open jobs, worst first: the ones nobody has priced, oldest at the top.
    -- A job with no quote after an hour is the single actionable signal this
    -- screen produces — it means the board is not being answered, and the
    -- owner can ring a driver before the customer gives up.
    'live', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id,
               'what', r.what,
               'errandKind', r.errand_kind,
               'status', r.status,
               'pickupText', r.pickup_text,
               'dropoffText', r.dropoff_text,
               'contactName', r.contact_name,
               'contactPhone', r.contact_phone,
               'spendCap', r.max_budget,
               'createdAt', r.created_at,
               'expiresAt', r.expires_at,
               'waitingMinutes', floor(extract(epoch from (now() - r.created_at)) / 60)::int,
               'quoteCount', r.quote_count,
               'bestQuote', r.best_quote
             ) order by (r.quote_count = 0) desc, r.created_at)
        from r where r.status = 'open'
    ), '[]'::jsonb),

    -- ── The funnel ──────────────────────────────────────────────────────
    'totals', (
      select jsonb_build_object(
        'posted',    count(*),
        'open',      count(*) filter (where status = 'open'),
        'booked',    count(*) filter (where status = 'accepted'),
        'expired',   count(*) filter (where status = 'expired'),
        'cancelled', count(*) filter (where status = 'cancelled'),
        -- The number that says whether drivers are answering at all. Counted
        -- over jobs that have had a fair chance — anything posted in the last
        -- hour has not yet failed to get a quote, and including it would make
        -- a healthy quiet morning look like a collapse.
        'settled',   count(*) filter (where created_at < now() - interval '1 hour'),
        'neverQuoted', count(*) filter (
          where quote_count = 0 and created_at < now() - interval '1 hour'
        ),
        -- Median, not mean: one job that sat overnight would drag an average
        -- past the point of meaning anything.
        'medianFirstQuoteMinutes', (
          select floor(percentile_cont(0.5) within group (
                   order by extract(epoch from (first_quote_at - created_at)) / 60
                 ))::int
            from r where first_quote_at is not null
        ),
        'moneyLaidOut', coalesce(sum(max_budget) filter (where status = 'accepted'), 0)
      ) from r
    ),

    -- ── By category ─────────────────────────────────────────────────────
    -- Which sorts of errand people ask for, and — the number that matters —
    -- how many of each actually got done. A category with plenty asked and
    -- none booked is one nobody on the island will take.
    'kinds', coalesce((
      select jsonb_agg(jsonb_build_object(
               'errandKind', errand_kind,
               'n', n,
               'booked', booked,
               'neverQuoted', never_quoted
             ) order by n desc, errand_kind)
        from (
          select errand_kind,
                 count(*) as n,
                 count(*) filter (where status = 'accepted') as booked,
                 count(*) filter (
                   where quote_count = 0 and created_at < now() - interval '1 hour'
                 ) as never_quoted
            from r
           where errand_kind is not null
           group by errand_kind
        ) g
    ), '[]'::jsonb),

    -- The words people actually typed. Kept because a category can only ever
    -- report the options we thought of first.
    'asks', coalesce((
      select jsonb_agg(x order by x_n desc, x_ask)
        from (
          select lower(btrim(split_part(what, E'\n', 1))) as x_ask,
                 count(*) as x_n,
                 jsonb_build_object(
                   'ask', min(btrim(split_part(what, E'\n', 1))),
                   'n', count(*),
                   'booked', count(*) filter (where status = 'accepted')
                 ) as x
            from r
           where btrim(coalesce(what, '')) <> ''
           group by 1
           order by count(*) desc
           limit 12
        ) g
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.admin_service_board(integer) from public, anon, authenticated;

comment on function public.admin_service_board(integer) is
  'Do It For Me service-line health for /admin/marketplace. Service-role only — the /admin cookie is the boundary, see lib/admin/api-guard.ts.';
