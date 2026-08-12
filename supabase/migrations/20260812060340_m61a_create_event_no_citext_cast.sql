-- M61a — admin_create_event() could not resolve the citext type at runtime.
--
-- stores.slug is citext, and M61 named that type to de-duplicate slugs. But the
-- function pins `search_path = public, pg_temp` (as every function here does)
-- and the citext extension lives in `extensions`, so the cast failed with
-- `type "citext" does not exist` the first time the function was called. M61's
-- own assertions passed, because they check structure rather than execution.
--
-- Two ways out: widen the search_path to include `extensions`, or stop naming
-- the type. Widening it to make a cast resolve is the wrong trade — the pin
-- exists so a caller cannot influence name resolution, and loosening it for
-- convenience is how that protection quietly erodes. Comparing the slug as text
-- needs no extension at all, and the INSERT relies on the implicit assignment
-- cast, which does not name a type either.
--
-- The generated slug is already lower-cased, so a text comparison finds exactly
-- the collisions a case-insensitive one would.
--
-- (This repo has now hit this twice — see m51_food_item_detail_no_citext_cast.)
--
-- Applied out of numeric order: M61b landed before this fix was registered,
-- because the first attempt at M61a aborted on a faulty assertion (it grepped
-- for the string "::citext" and matched its own explanatory comment — a check
-- that passes while the code is broken, and fails while the code is right).

create or replace function public.admin_create_event(
  p_name          text,
  p_starts_at     timestamptz,
  p_slug          text default null,
  p_ends_at       timestamptz default null,
  p_doors_open_at timestamptz default null,
  p_venue_name    text default null,
  p_venue_address text default null,
  p_timezone      text default 'Indian/Mauritius',
  p_support_phone text default null,
  p_terms         text default null,
  p_capacity      int default null,
  p_is_test       boolean default false
) returns jsonb language plpgsql security definer set search_path = public, pg_temp
as $function$
declare
  v_merchant uuid; v_store uuid; v_slug text; v_base text; v_n int := 1;
begin
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode='RR003', message='Not found.';
  end if;

  if nullif(btrim(coalesce(p_name,'')),'') is null then
    raise exception using errcode='RR005', message='The event needs a name.';
  end if;
  if p_starts_at is null then
    raise exception using errcode='RR005', message='The event needs a start date and time.';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception using errcode='RR005', message='The end time has to be after the start time.';
  end if;
  if p_capacity is not null and p_capacity <= 0 then
    raise exception using errcode='RR005', message='Capacity has to be at least 1, or empty for no limit.';
  end if;

  select id into v_merchant from merchants where system_key = 'events';
  if v_merchant is null then
    raise exception using errcode='RR004',
      message='The platform events merchant is missing. M40 must run before events can be created.';
  end if;

  v_base := lower(regexp_replace(btrim(coalesce(nullif(btrim(coalesce(p_slug,'')),''), p_name)),
                                 '[^a-zA-Z0-9]+', '-', 'g'));
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'event'; end if;
  v_slug := v_base;
  -- Compared as text on purpose. See the note at the top of this migration.
  while exists (select 1 from stores s where s.slug::text = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  insert into stores (merchant_id, name, slug, status, is_test)
  values (v_merchant, btrim(p_name), v_slug, 'draft', coalesce(p_is_test, false))
  returning id into v_store;

  insert into events (store_id, starts_at, ends_at, doors_open_at, venue_name,
                      venue_address, timezone, support_phone, terms, capacity)
  values (v_store, p_starts_at, p_ends_at, p_doors_open_at,
          nullif(btrim(coalesce(p_venue_name,'')),''),
          nullif(btrim(coalesce(p_venue_address,'')),''),
          coalesce(nullif(btrim(coalesce(p_timezone,'')),''), 'Indian/Mauritius'),
          nullif(btrim(coalesce(p_support_phone,'')),''),
          nullif(btrim(coalesce(p_terms,'')),''),
          p_capacity);

  insert into audit_logs (actor_id, actor_role, action, entity_type, entity_id, diff)
  values (auth.uid(), 'platform_admin', 'event.created', 'stores', v_store::text,
          jsonb_build_object('name', btrim(p_name), 'slug', v_slug, 'startsAt', p_starts_at,
                             'isTest', coalesce(p_is_test,false)));

  return jsonb_build_object('storeId', v_store, 'slug', v_slug, 'status', 'draft');
end;
$function$;

revoke all on function public.admin_create_event(text, timestamptz, text, timestamptz, timestamptz, text, text, text, text, text, int, boolean) from public, anon, authenticated;
grant execute on function public.admin_create_event(text, timestamptz, text, timestamptz, timestamptz, text, text, text, text, text, int, boolean) to service_role;

-- Prove it by CALLING it, not by grepping the source.
do $$
declare v_j jsonb; v_store uuid;
begin
  v_j := admin_create_event(p_name => 'M61a citext probe', p_starts_at => now() + interval '400 days');
  v_store := (v_j->>'storeId')::uuid;
  if v_store is null then raise exception 'M61a: create still fails.'; end if;
  if (v_j->>'status') <> 'draft' then raise exception 'M61a: event did not start as a draft.'; end if;
  perform admin_delete_event(v_store);
  if exists (select 1 from stores where id = v_store) then
    raise exception 'M61a: probe event was not cleaned up.'; end if;
end;
$$;
