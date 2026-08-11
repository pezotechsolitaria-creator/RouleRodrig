-- M60e — pin the search_path on the fee helper.
--
-- Found by the Supabase security linter, not by review: managed_ticketing_fee()
-- shipped without `set search_path`, the only function in M59/M60 that did. It
-- is the lowest-risk case — plain SQL, IMMUTABLE, no SECURITY DEFINER, so it
-- runs with the caller's own rights rather than the definer's — but a mutable
-- search_path is still a resolution the caller controls, and every other
-- function in this codebase pins it. One exception is how a convention stops
-- being one.
--
-- Signature and behaviour are unchanged; this is the same integer arithmetic,
-- with the lookup path fixed.

create or replace function public.managed_ticketing_fee(
  p_fee_type managed_fee_type, p_amount int, p_rate_e5 int, p_basis int)
returns int language sql immutable set search_path = public, pg_temp
as $function$
  select case
    when p_fee_type = 'fixed'      then coalesce(p_amount, 0)
    when p_fee_type = 'percentage' then ((coalesce(p_basis,0)::bigint * coalesce(p_rate_e5,0) + 50000) / 100000)::int
    else 0 end;
$function$;

do $$
declare v_cfg text[];
begin
  select p.proconfig into v_cfg from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='managed_ticketing_fee';
  if v_cfg is null or not (v_cfg::text like '%search_path%') then
    raise exception 'M60e: search_path is still mutable on managed_ticketing_fee.';
  end if;

  -- The maths must not have changed: 10% of 30000 is 3000, and a fixed fee is
  -- returned verbatim.
  if managed_ticketing_fee('percentage', null, 10000, 30000) <> 3000 then
    raise exception 'M60e: percentage arithmetic changed.'; end if;
  if managed_ticketing_fee('fixed', 4500, null, 999999) <> 4500 then
    raise exception 'M60e: fixed fee arithmetic changed.'; end if;
  -- Round-half-up at the boundary, matching the marketplace commission idiom.
  if managed_ticketing_fee('percentage', null, 1, 50000) <> 1 then
    raise exception 'M60e: rounding changed.'; end if;
end;
$$;
