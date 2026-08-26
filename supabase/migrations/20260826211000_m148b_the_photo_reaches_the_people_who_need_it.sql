-- ── M148b — the photo has to reach the driver deciding whether to quote ────
--
-- M148 stores it. This is what makes it useful: a driver looking at the board
-- is exactly the person the picture is for. "2 gas bottles" and a photo of two
-- gas bottles are not the same information — one of them tells a driver
-- whether they fit in the car.
--
-- The board carries a PATH, not a URL. The bucket is private, and the driver's
-- own endpoint signs it for a few minutes when it hands the board over.

create or replace function public.driver_open_requests()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_d delivery_drivers%rowtype;
begin
  v_d := current_driver();
  if v_d.status <> 'approved' then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(jsonb_agg(x order by x->>'createdAt'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', r.id,
        'kind', r.kind,
        'what', r.what,
        'sizeClass', r.size_class,
        'pickupText', r.pickup_text,
        'pickupNote', r.pickup_note,
        'dropoffText', r.dropoff_text,
        'dropoffNote', r.dropoff_note,
        'spendCap', r.max_budget,
        'createdAt', r.created_at,
        'expiresAt', r.expires_at,
        -- A storage PATH, not a URL. The bucket is private; the driver's API
        -- signs it for a few minutes when it hands the board over.
        'photoPath', r.photo_url,
        -- Off duty: this row exists ONLY so the driver can withdraw a standing
        -- price. The UI hides "name your price" and shows Withdraw.
        'offDuty', (v_d.availability = 'offline'),
        'quoteCount', (select count(*) from delivery_quotes q
                        where q.request_id = r.id and q.status = 'offered'),
        'myQuote', (select jsonb_build_object('id', q.id, 'fee', q.fee, 'note', q.note)
                      from delivery_quotes q
                     where q.request_id = r.id and q.driver_id = v_d.id
                       and q.status = 'offered')
      ) as x
      from delivery_requests r
      where r.status = 'open'
        and (r.expires_at is null or r.expires_at > now())
        and vehicle_can_carry(v_d.vehicle_type, r.size_class)
        and (
          v_d.availability <> 'offline'
          or exists (select 1 from delivery_quotes q
                      where q.request_id = r.id and q.driver_id = v_d.id
                        and q.status = 'offered')
        )
    ) s
  );
end;
$fn$;

revoke all on function public.driver_open_requests() from public, anon, authenticated;
grant execute on function public.driver_open_requests() to authenticated;

do $assert$
begin
  if has_function_privilege('anon','public.driver_open_requests()','execute') then
    raise exception 'M148b: the board is reachable by anon';
  end if;
  begin
    perform driver_open_requests();
    raise exception 'M148b: the board answered with no session';
  exception when sqlstate 'RR080' then null;
  end;
end;
$assert$;
