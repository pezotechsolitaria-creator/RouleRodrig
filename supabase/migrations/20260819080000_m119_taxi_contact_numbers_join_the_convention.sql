-- ══════════════════════════════════════════════════════════════════════════
-- M119 — taxi contact numbers join the convention the rest of the platform has
-- ══════════════════════════════════════════════════════════════════════════
--
-- ── THE REPORT ────────────────────────────────────────────────────────────
-- "Fix the whatsapp empty string."
--
-- taxi_drivers.whatsapp held '' — an empty string, not NULL — for the only
-- driver on the island. Empty string is not NULL, so every fallback of the
-- shape `coalesce(t.whatsapp, t.phone)` returned the BLANK instead of falling
-- back to the phone number. Four deployed functions read it that way:
-- taxi_offer_targets, offer_ride, admin_live_map and lookup_ride.
--
-- ── THE SECOND HALF, WHICH THE COALESCE FIX ALONE DOES NOT SOLVE ──────────
-- taxi_drivers.phone is '58066022'. No country code. So even once the blank is
-- gone, that number:
--   * fails lib/notifications/whatsapp.ts's own E.164 gate, so every offer
--     would land in `failed` for ever, and
--   * builds wa.me/58066022 — a link to a country code that does not exist.
--
-- So the storage SHAPE is the fix, not the coalesce. Two sibling tables have
-- carried the invariant since they were created:
--
--   delivery_drivers_phone_check    check (phone ~ '^\+[1-9][0-9]{6,15}$')
--   notification_slots_phone_check  check (phone ~ '^\+[1-9][0-9]{6,15}$')
--   taxi_drivers                    8 checks, none on name/phone/whatsapp
--
-- taxi_drivers was the last table outside the convention, and being outside it
-- is what let both halves of this bug exist. Store E.164 and every wa.me call
-- site becomes correct with no TypeScript change at all, because
-- '+23058066022'.replace(/\D/g,'') is '23058066022' and sendWhatsApp strips the
-- leading + itself.
--
-- ── WHY THE READ SITES ARE NOT PATCHED ────────────────────────────────────
-- Because they do not need to be, and patching them is the riskier option.
-- These two columns have exactly ONE writer in the whole system: no SQL
-- function writes them (verified against pg_proc), and the app writes them from
-- app/api/admin/taxi/route.ts alone. One writer plus one constraint makes the
-- bare coalesce provably correct everywhere at once.
--
-- Rewriting four large functions whose bodies have DRIFTED from the repo .sql
-- — to defend against a state the database now forbids — would risk silently
-- reverting whatever else drifted in them. Six nullif()s that each have to be
-- remembered for ever are not a fix; they are six future bugs.
--
-- ── WHY A CHECK AND NOT A TRIGGER ─────────────────────────────────────────
-- A normalising trigger silently rewrites what the owner typed. He should be
-- told "that is not a number we can message" at the form, not have his input
-- mutated underneath him. taxi_drivers has no triggers at all today — not even
-- set_updated_at — and this is not the place to start. The CHECK is
-- declarative, matches the sibling tables name for name, and covers every
-- future writer including one nobody has written yet.

-- ── 1 · blank means absent ────────────────────────────────────────────────
update public.taxi_drivers
   set whatsapp = null
 where whatsapp is not null and btrim(whatsapp) = '';

-- ── 2 · bare local numbers get their country code ─────────────────────────
-- Exactly 8 digits and nothing else. Anything ambiguous is left alone and
-- caught by the assertion below, so a number nobody anticipated is a FAILED
-- migration rather than a silent rewrite of somebody's contact details.
update public.taxi_drivers
   set phone = '+230' || regexp_replace(phone, '\D', '', 'g')
 where phone !~ '^\+[1-9][0-9]{6,15}$'
   and length(regexp_replace(phone, '\D', '', 'g')) = 8;

update public.taxi_drivers
   set whatsapp = '+230' || regexp_replace(whatsapp, '\D', '', 'g')
 where whatsapp is not null
   and whatsapp !~ '^\+[1-9][0-9]{6,15}$'
   and length(regexp_replace(whatsapp, '\D', '', 'g')) = 8;

-- ── 3 · prove it before constraining it ───────────────────────────────────
-- A row this migration did not anticipate fails HERE, with a sentence, rather
-- than at ALTER TABLE with only a constraint name to go on.
do $$
declare v_bad text;
begin
  select string_agg(format('%s (%s)', name, phone), ', ') into v_bad
    from public.taxi_drivers
   where phone !~ '^\+[1-9][0-9]{6,15}$'
      or (whatsapp is not null and whatsapp !~ '^\+[1-9][0-9]{6,15}$');
  if v_bad is not null then
    raise exception 'M119: taxi_drivers still holds a non-E.164 contact number: %', v_bad;
  end if;
end $$;

-- ── 4 · the invariant ─────────────────────────────────────────────────────
-- `whatsapp is null or <regex>` subsumes the blank rule, because '' fails the
-- regex. One constraint, not two.
alter table public.taxi_drivers
  add constraint taxi_drivers_phone_check
    check (phone ~ '^\+[1-9][0-9]{6,15}$'),
  add constraint taxi_drivers_whatsapp_check
    check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{6,15}$'),
  add constraint taxi_drivers_name_check
    check (btrim(name) <> '');

-- ── 5 · the badge that would have gone green over an unreachable driver ───
-- taxi_whatsapp_readiness tested the CallMeBot credential and never the
-- destination. The moment the owner pasted an api_key, the admin desk would
-- have said "WhatsApp ready" beside a row whose number could not be dialled.
create or replace function public.taxi_whatsapp_readiness()
returns table(driver_id uuid, whatsapp_ready boolean)
language sql stable security definer set search_path to 'public','pg_temp'
as $function$
  select id,
         (whatsapp_api_key is not null and length(btrim(whatsapp_api_key)) > 0)
         and coalesce(whatsapp, phone) ~ '^\+[1-9][0-9]{6,15}$'
    from taxi_drivers;
$function$;

-- ── 6 · verification ──────────────────────────────────────────────────────
do $$
declare v_n integer; v_ready boolean; v_id uuid;
begin
  -- The constraints exist and are named like their siblings.
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.taxi_drivers'::regclass
     and conname in ('taxi_drivers_phone_check','taxi_drivers_whatsapp_check','taxi_drivers_name_check');
  if v_n <> 3 then raise exception 'M119: expected 3 new constraints, found %', v_n; end if;

  -- A blank whatsapp is now IMPOSSIBLE, which is the whole point.
  select id into v_id from taxi_drivers limit 1;
  if v_id is not null then
    begin
      update taxi_drivers set whatsapp = '' where id = v_id;
      raise exception 'M119: an empty whatsapp was still accepted';
    exception when check_violation then null;
    end;
    begin
      update taxi_drivers set phone = '58066022' where id = v_id;
      raise exception 'M119: a bare local phone number was still accepted';
    exception when check_violation then null;
    end;

    -- ...and the fallback every read site depends on now yields a real number.
    if (select coalesce(whatsapp, phone) from taxi_drivers where id = v_id)
       !~ '^\+[1-9][0-9]{6,15}$' then
      raise exception 'M119: coalesce(whatsapp, phone) still does not yield an E.164 number';
    end if;
  end if;

  -- plpgsql/sql bodies are not resolved until first call.
  select whatsapp_ready into v_ready from taxi_whatsapp_readiness() limit 1;

  if has_function_privilege('anon', 'public.taxi_whatsapp_readiness()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.taxi_whatsapp_readiness()', 'EXECUTE') then
    raise exception 'M119: taxi_whatsapp_readiness must stay service_role-only';
  end if;

  raise notice 'M119 verified: taxi contact numbers are E.164 or absent.';
end $$;
