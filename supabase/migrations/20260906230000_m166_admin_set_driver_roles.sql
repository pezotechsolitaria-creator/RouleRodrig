-- ── Turning errands on or off for one person ───────────────────────────────
--
-- The owner: "add a toggle in admin to switch errands on off per driver."
--
-- Until now the role could only be set once, by the applicant, on the form.
-- Every existing driver was backfilled to errands-enabled when the column
-- arrived, and there was no way to change any of it afterwards — so somebody
-- who turned out to be unsuited to handling a customer's cash could only be
-- suspended outright, which also takes away the parcel work they were fine at.
--
-- Modelled on admin_set_driver_status, deliberately: same admin check, same
-- audit row, same shape of return. A second dialect of "admin changes a driver"
-- is how the two drift.
create or replace function public.admin_set_driver_roles(
  p_driver_id uuid,
  p_can_deliver boolean,
  p_can_run_errands boolean
) returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d delivery_drivers%rowtype;
  v_open int;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;
  select * into v_d from delivery_drivers where id = p_driver_id for update;
  if not found then
    raise exception using errcode = 'RR003', message = 'Not found.';
  end if;

  -- Mirrors delivery_drivers_does_something, so the admin gets a sentence
  -- rather than a 23514 the board cannot render.
  if not (coalesce(p_can_deliver, false) or coalesce(p_can_run_errands, false)) then
    raise exception using errcode = 'RR089',
      message = 'A driver must be able to do at least one kind of work. Suspend them instead.';
  end if;

  update delivery_drivers
     set can_deliver = coalesce(p_can_deliver, false),
         can_run_errands = coalesce(p_can_run_errands, false)
   where id = p_driver_id;

  -- ── THE PRICES THEY ALREADY HAVE STANDING ──────────────────────────────
  -- Turning errands off must also withdraw their live quotes on errands.
  -- Without this the person disappears from the board and their old price
  -- stays bookable — a customer accepts it, and the platform hands a job to
  -- somebody it has just decided should not be doing that work.
  update delivery_quotes q
     set status = 'withdrawn'
    from delivery_requests r
   where q.request_id = r.id
     and q.driver_id = p_driver_id
     and q.status = 'offered'
     and ((r.kind = 'errand' and not coalesce(p_can_run_errands, false))
       or (r.kind <> 'errand' and not coalesce(p_can_deliver, false)));
  get diagnostics v_open = row_count;

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(),
          case when auth.uid() is null then 'admin_cookie_session' else 'platform_admin' end,
          'driver.roles', 'delivery_driver', p_driver_id::text,
          jsonb_build_object(
            'from', jsonb_build_object('canDeliver', v_d.can_deliver,
                                       'canRunErrands', v_d.can_run_errands),
            'to',   jsonb_build_object('canDeliver', coalesce(p_can_deliver, false),
                                       'canRunErrands', coalesce(p_can_run_errands, false)),
            'quotesWithdrawn', v_open));

  return jsonb_build_object(
    'ok', true,
    'canDeliver', coalesce(p_can_deliver, false),
    'canRunErrands', coalesce(p_can_run_errands, false),
    'quotesWithdrawn', v_open,
    'warning', case when v_open > 0
      then format('%s standing price%s withdrawn, because that work is no longer theirs.',
                  v_open, case when v_open = 1 then '' else 's' end)
      else null end);
end;
$function$;

revoke all on function public.admin_set_driver_roles(uuid, boolean, boolean)
  from public, anon, authenticated;
