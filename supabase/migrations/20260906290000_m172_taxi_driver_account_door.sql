-- ── A taxi driver on /account, in the same format as everyone else ─────────
--
-- The owner: "put taxi driver in the same format."
--
-- Every other role reaches its console from /account because every other role
-- IS a Supabase account. A taxi driver is not: `taxi_drivers` had no user_id at
-- all, and they reach /d/<token> by typing a 6-character code into the box on
-- /account. So a taxi driver signed in, saw no door, and had to find that code
-- again every single time.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
-- It does NOT grant `authenticated` read on taxi_drivers. That table is
-- deliberately unreadable by client roles — every legitimate reader goes
-- through a SECURITY DEFINER function — and its one policy
-- (taxi_anon_select_active) is ROW-level, so a table grant would hand every
-- signed-in visitor every column of every active driver, `driver_token` and
-- `whatsapp_api_key` included. The token IS the credential; leaking it is
-- handing over the account. This is the same shape as the delivery_drivers
-- grant one migration earlier, and the opposite decision, for that reason.
alter table taxi_drivers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists taxi_drivers_user_id_key
  on taxi_drivers (user_id) where user_id is not null;

comment on column taxi_drivers.user_id is
  'Set when a signed-in person types this driver''s own code. Lets /account show their door instead of asking for the code again. Never a login path in itself — the token still is.';

-- ── Binding, as a side effect of proving they know the code ────────────────
-- Same signature and same return, so /api/driver-signin does not change. The
-- link happens only on a SUCCESSFUL match, only when somebody is signed in, and
-- only if the row is not already claimed — typing a colleague's code cannot
-- move their driver onto your account.
create or replace function public.driver_link_by_code(p_code text, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code  text;
  v_phone text;
  v_token text;
  v_id    uuid;
  v_owner uuid;
  v_uid   uuid := auth.uid();
begin
  v_code := lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g'));
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

  if length(v_code) < 6 then
    return jsonb_build_object('ok', false);
  end if;
  v_code := left(v_code, 6);

  select d.id, d.driver_token, d.user_id into v_id, v_token, v_owner
  from public.taxi_drivers d
  where left(d.driver_token, 6) = v_code
    -- Only enforced when a number was actually given: an empty phone means
    -- "code only", a supplied one still has to be the right driver's.
    and (
      length(v_phone) < 6
      or right(regexp_replace(coalesce(d.phone, ''), '[^0-9]', '', 'g'), 8) = right(v_phone, 8)
    )
  limit 1;

  if v_token is null then
    return jsonb_build_object('ok', false);
  end if;

  -- Remember them, so there is never a second time. Only an UNCLAIMED row, and
  -- the unique index stops one account holding two drivers — caught, so a
  -- shared phone cannot turn a successful sign-in into an error.
  if v_uid is not null and v_owner is null then
    begin
      update taxi_drivers set user_id = v_uid where id = v_id and user_id is null;
    exception when unique_violation then
      null;
    end;
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$function$;

-- ── The door itself ────────────────────────────────────────────────────────
-- Returns ONLY the caller's own driver, and only the three fields the account
-- page needs to draw a link. No phone, no api key, no other driver, ever.
create or replace function public.my_taxi_driver()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select case when d.id is null then null
         else jsonb_build_object(
                'name', d.name,
                'token', d.driver_token,
                'active', d.active)
         end
    from taxi_drivers d
   where d.user_id = auth.uid()
   limit 1;
$function$;

revoke all on function public.my_taxi_driver() from public, anon;
grant execute on function public.my_taxi_driver() to authenticated;
