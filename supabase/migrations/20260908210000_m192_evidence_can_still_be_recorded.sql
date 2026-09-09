-- ── THE ONE WINDOW IN WHICH EVIDENCE COULD BE RECORDED ─────────────────────
--
-- attach_delivery_payment_proof() and attach_delivery_id_document() both
-- refused unless the delivery was exactly 'assigned':
--
--     if v_d.status <> 'assigned' then
--       raise exception 'This delivery has already started.'
--
-- The reasoning goes as far as it goes: once the driver is under way the
-- document has done its job, and churn afterwards is noise.
--
-- It only holds if the driver set off BECAUSE the document arrived. When an
-- operator uses admin_force_delivery_status() to unstick a job — the office's
-- only tool for exactly the stuck bank-transfer deliveries these gates create
-- — the status moves off 'assigned', and the customer can then NEVER attach
-- their receipt. The evidence of a payment that really happened becomes
-- permanently unrecordable, by the act of working around the gate.
--
-- So the gate is now about whether there is anything left to evidence, not
-- about which leg the driver is on:
--
--     delivered / cancelled / failed_delivery / returned_to_merchant
--       -> 'This delivery is finished.'
--     anything else -> accept
--
-- ── AND RE-ATTACHING STAYS ALLOWED, DELIBERATELY ──────────────────────────
-- There is no "already attached" guard, and I considered adding one. A first
-- upload that comes out blurry or upside down is common on a phone, and until
-- a legible one arrives the driver is held at the gate. Refusing the second
-- attempt would strand exactly the person who is trying to fix it.
--
-- Every attach writes a delivery event, so the history of what was uploaded
-- and when survives regardless — replacing the file does not erase the record
-- of the earlier one.
do $$
declare
  v_def  text;
  v_name text;
  v_old  constant text := E'  if v_d.status <> ''assigned'' then\n    raise exception ''This delivery has already started.'' using errcode = ''P0001'';\n  end if;';
begin
  foreach v_name in array array['attach_delivery_payment_proof', 'attach_delivery_id_document']
  loop
    select pg_get_functiondef(oid) into v_def
      from pg_proc
     where pronamespace = 'public'::regnamespace and proname = v_name;

    if v_def is null then
      raise exception '% not found', v_name;
    end if;

    -- Already applied. Re-running is a no-op.
    if position('is finished' in v_def) > 0 then
      continue;
    end if;

    if position(v_old in v_def) = 0 then
      raise exception 'the % gate moved — refusing to rewrite blind', v_name;
    end if;

    v_def := replace(
      v_def,
      v_old,
      E'  -- Not after it is over. NOT "only while assigned" — an operator\n'
      || E'  -- forcing a stuck job past that status used to make the evidence\n'
      || E'  -- permanently unrecordable.\n'
      || E'  if v_d.status in (''delivered'', ''cancelled'', ''failed_delivery'', ''returned_to_merchant'') then\n'
      || E'    raise exception ''This delivery is finished.'' using errcode = ''P0001'';\n'
      || E'  end if;'
    );

    execute v_def;
  end loop;
end $$;
