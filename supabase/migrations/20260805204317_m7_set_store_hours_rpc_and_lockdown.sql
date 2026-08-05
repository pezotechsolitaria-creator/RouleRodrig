-- Writes to store_hours go through ONE validating, ownership-checking RPC, and
-- the raw table grants are withdrawn.
--
-- store_hours shipped on Supabase's default blanket grants: anon and
-- authenticated both held INSERT/UPDATE/DELETE/TRUNCATE, held back only by RLS.
-- That is the exact posture M7 already judged unacceptable on orders — and
-- TRUNCATE is not subject to RLS at all, so anon could have emptied the table.
--
-- Routing writes through a SECURITY DEFINER RPC also means the merchant
-- dashboard and the admin dashboard share one code path, so the validation
-- cannot drift between them.
create or replace function set_store_hours(p_store_id uuid, p_days jsonb)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  v_day    jsonb;
  v_wd     smallint;
  v_closed boolean;
  v_count  integer := 0;
  v_seen   smallint[] := '{}';
begin
  if p_store_id is null or not exists (select 1 from stores s where s.id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'Shop not found.';
  end if;
  -- Re-verified here, independently of RLS, because this function runs as its
  -- owner. Same rule as the table policy: your own shop, or a platform admin.
  if not (is_store_staff(p_store_id) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Shop not found.';
  end if;

  if p_days is null or jsonb_typeof(p_days) <> 'array' then
    raise exception using errcode = 'RR005', message = 'A weekly schedule is required.';
  end if;
  if jsonb_array_length(p_days) > 7 then
    raise exception using errcode = 'RR005', message = 'A week has seven days.';
  end if;

  for v_day in select * from jsonb_array_elements(p_days) loop
    v_wd := (v_day ->> 'weekday')::smallint;
    if v_wd is null or v_wd < 0 or v_wd > 6 then
      raise exception using errcode = 'RR005', message = 'Each day needs a weekday between 0 and 6.';
    end if;
    if v_wd = any(v_seen) then
      raise exception using errcode = 'RR005', message = 'That weekday appears twice.';
    end if;
    v_seen := v_seen || v_wd;

    v_closed := coalesce((v_day ->> 'is_closed')::boolean, false);
    if not v_closed then
      if (v_day ->> 'opens_at') is null or (v_day ->> 'closes_at') is null then
        raise exception using errcode = 'RR005',
          message = 'An open day needs both an opening and a closing time.';
      end if;
      if (v_day ->> 'closes_at')::time <= (v_day ->> 'opens_at')::time then
        raise exception using errcode = 'RR005',
          message = 'Closing time must be after opening time.';
      end if;
      -- Delivery window, when narrowed, must sit inside the shop's own hours.
      if (v_day ->> 'delivery_opens_at') is not null or (v_day ->> 'delivery_closes_at') is not null then
        if (v_day ->> 'delivery_opens_at') is null or (v_day ->> 'delivery_closes_at') is null then
          raise exception using errcode = 'RR005',
            message = 'A delivery window needs both a start and an end time.';
        end if;
        if (v_day ->> 'delivery_closes_at')::time <= (v_day ->> 'delivery_opens_at')::time then
          raise exception using errcode = 'RR005',
            message = 'Delivery must end after it starts.';
        end if;
        if (v_day ->> 'delivery_opens_at')::time < (v_day ->> 'opens_at')::time then
          raise exception using errcode = 'RR005',
            message = 'Delivery cannot start before the shop opens.';
        end if;
        if (v_day ->> 'delivery_closes_at')::time > (v_day ->> 'closes_at')::time then
          raise exception using errcode = 'RR005',
            message = 'Delivery cannot end after the shop closes.';
        end if;
      end if;
    end if;
  end loop;

  -- Replace the recurring week atomically. Dated overrides (date is not null)
  -- are holidays and are deliberately left alone.
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

revoke execute on function set_store_hours(uuid, jsonb) from public, anon;

grant  execute on function set_store_hours(uuid, jsonb) to authenticated;

-- Raw table writes are now closed. Reads stay open: the storefront must be able
-- to show opening hours, and store_hours_read already scopes them to visible
-- shops plus staff plus admins.
revoke insert, update, delete, truncate on store_hours from anon, authenticated;

revoke select on store_hours from anon, authenticated;

grant  select on store_hours to anon, authenticated;
