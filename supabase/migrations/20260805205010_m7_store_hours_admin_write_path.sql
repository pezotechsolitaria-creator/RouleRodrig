-- Admin overrides could not work, and it would have failed silently in review.
--
-- set_store_hours() gated on `is_store_staff(...) or is_platform_admin()`. The
-- /admin dashboard has no Supabase user at all — it authenticates with a signed
-- password cookie and talks to the database through the SERVICE ROLE. Verified
-- live: under service_role, auth.uid() and auth.role() are both NULL and
-- request.jwt.claims is unset, so BOTH of those predicates are false and every
-- admin write would have raised RR003 "Shop not found."
--
-- current_user cannot rescue it either: inside a SECURITY DEFINER function
-- current_user is the function OWNER, not the caller, so the function cannot see
-- that it was invoked by service_role.
--
-- Resolution: authorize by GRANT rather than by in-function identity, and keep
-- ONE copy of the rules.
--   store_hours_write_internal — all validation + the write. Executable by
--                                nobody; reachable only via the two wrappers,
--                                which run as owner and therefore may call it.
--   set_store_hours            — merchant door. Checks staff/admin. -> authenticated
--   admin_set_store_hours      — platform door. No identity check because the
--                                grant IS the authorization.          -> service_role
-- Two doors, one implementation, so merchant and admin validation cannot drift.
create or replace function store_hours_write_internal(p_store_id uuid, p_days jsonb)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_day jsonb; v_wd smallint; v_closed boolean;
  v_count integer := 0; v_seen smallint[] := '{}';
begin
  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception using errcode='RR005', message='A weekly schedule is required.';
  end if;
  if jsonb_array_length(p_days) > 7 then
    raise exception using errcode='RR005', message='A week has seven days.';
  end if;

  for v_day in select * from jsonb_array_elements(p_days) loop
    v_wd := (v_day ->> 'weekday')::smallint;
    if v_wd is null or v_wd < 0 or v_wd > 6 then
      raise exception using errcode='RR005', message='Each day needs a weekday between 0 and 6.';
    end if;
    if v_wd = any(v_seen) then
      raise exception using errcode='RR005', message='That weekday appears twice.';
    end if;
    v_seen := v_seen || v_wd;

    v_closed := coalesce((v_day ->> 'is_closed')::boolean, false);
    if not v_closed then
      if (v_day ->> 'opens_at') is null or (v_day ->> 'closes_at') is null then
        raise exception using errcode='RR005', message='An open day needs both an opening and a closing time.';
      end if;
      if (v_day ->> 'closes_at')::time <= (v_day ->> 'opens_at')::time then
        raise exception using errcode='RR005', message='Closing time must be after opening time.';
      end if;
      if (v_day ->> 'delivery_opens_at') is not null or (v_day ->> 'delivery_closes_at') is not null then
        if (v_day ->> 'delivery_opens_at') is null or (v_day ->> 'delivery_closes_at') is null then
          raise exception using errcode='RR005', message='A delivery window needs both a start and an end time.';
        end if;
        if (v_day ->> 'delivery_closes_at')::time <= (v_day ->> 'delivery_opens_at')::time then
          raise exception using errcode='RR005', message='Delivery must end after it starts.';
        end if;
        if (v_day ->> 'delivery_opens_at')::time < (v_day ->> 'opens_at')::time then
          raise exception using errcode='RR005', message='Delivery cannot start before the shop opens.';
        end if;
        if (v_day ->> 'delivery_closes_at')::time > (v_day ->> 'closes_at')::time then
          raise exception using errcode='RR005', message='Delivery cannot end after the shop closes.';
        end if;
      end if;
    end if;
  end loop;

  -- Recurring week replaced atomically; dated holiday overrides left intact.
  delete from store_hours h where h.store_id = p_store_id and h.date is null;

  insert into store_hours (store_id, weekday, opens_at, closes_at,
                           delivery_opens_at, delivery_closes_at, delivery_closed, is_closed, note)
  select p_store_id,
         (d ->> 'weekday')::smallint,
         case when coalesce((d ->> 'is_closed')::boolean,false) then null else (d ->> 'opens_at')::time end,
         case when coalesce((d ->> 'is_closed')::boolean,false) then null else (d ->> 'closes_at')::time end,
         case when coalesce((d ->> 'is_closed')::boolean,false) then null else (d ->> 'delivery_opens_at')::time end,
         case when coalesce((d ->> 'is_closed')::boolean,false) then null else (d ->> 'delivery_closes_at')::time end,
         coalesce((d ->> 'delivery_closed')::boolean, false),
         coalesce((d ->> 'is_closed')::boolean, false),
         nullif(trim(d ->> 'note'), '')
  from jsonb_array_elements(p_days) d;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function store_hours_write_internal(uuid, jsonb) from public, anon, authenticated, service_role;

-- Merchant door.
create or replace function set_store_hours(p_store_id uuid, p_days jsonb)
returns integer
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_store_id is null or not exists (select 1 from stores s where s.id = p_store_id) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;
  if not (is_store_staff(p_store_id) or is_platform_admin()) then
    -- Same message for "no such shop" and "not yours", so this cannot be used
    -- to discover which store ids exist.
    raise exception using errcode='RR003', message='Shop not found.';
  end if;
  return store_hours_write_internal(p_store_id, p_days);
end;
$$;

revoke execute on function set_store_hours(uuid, jsonb) from public, anon;

grant  execute on function set_store_hours(uuid, jsonb) to authenticated;

-- Platform door. Deliberately no identity predicate: it is executable only by
-- service_role, and the only thing holding the service key is the cookie-gated
-- /admin API. Granting this to authenticated would be a privilege escalation.
create or replace function admin_set_store_hours(p_store_id uuid, p_days jsonb)
returns integer
language plpgsql volatile security definer set search_path = public as $$
begin
  if p_store_id is null or not exists (select 1 from stores s where s.id = p_store_id) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;
  return store_hours_write_internal(p_store_id, p_days);
end;
$$;

revoke execute on function admin_set_store_hours(uuid, jsonb) from public, anon, authenticated;

grant  execute on function admin_set_store_hours(uuid, jsonb) to service_role;

-- Every shop plus its live status in ONE round trip. The lateral join evaluates
-- the schedule engine per row inside Postgres, so the admin list never becomes
-- an N+1 of one RPC call per shop.
create or replace function admin_store_schedules()
returns table (
  store_id uuid, store_name text, slug text, store_status text,
  merchant_name text, merchant_status text, offers_rr_delivery boolean,
  has_schedule boolean, is_open boolean, delivery_available boolean,
  opens_at time, closes_at time, is_closed boolean,
  delivery_opens_at time, delivery_closes_at time, delivery_closed boolean,
  weekday smallint, next_open_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.slug::text, s.status::text,
         m.display_name, m.status::text,
         coalesce(p.offers_rr_delivery, true),
         st.has_schedule, st.is_open, st.delivery_available,
         st.opens_at, st.closes_at, st.is_closed,
         st.delivery_opens_at, st.delivery_closes_at, st.delivery_closed,
         st.weekday, st.next_open_at
  from stores s
  join merchants m on m.id = s.merchant_id
  left join store_payment_settings p on p.store_id = s.id
  cross join lateral store_schedule_status(s.id) st
  order by s.name;
$$;

revoke execute on function admin_store_schedules() from public, anon, authenticated;

grant  execute on function admin_store_schedules() to service_role;
