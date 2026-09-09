-- ── M197: "I CLEARED IT AND IT IS STILL THERE" ─────────────────────────────
--
-- The owner cleared delivery c1caff48 on 6 September. Four days later they
-- still called it stuck, and they were right: /admin/operations went on
-- printing "Delivery needs you — Order RR-F3D2BF" the whole time, because the
-- feed's delivery loop selects on status alone and never looks at cleared_at.
--
-- Clearing is the button the product offers for exactly this situation, so a
-- reader that ignores it makes the button a lie. M176 taught three readers
-- about cleared_at and missed this one.
--
-- Anchored rewrite: read the function as the database currently has it, make
-- the one substitution, and refuse if the shape is not what we expect — so
-- this cannot silently clobber a definition someone changed in between.

do $$
declare
  v_src  text;
  v_new  text;
  v_from text := 'where d.status in (''requires_admin'', ''driver_unresponsive'', ''failed_delivery'')';
  v_to   text := 'where d.status in (''requires_admin'', ''driver_unresponsive'', ''failed_delivery'')'
                 || E'\n       and d.cleared_at is null';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_operations_feed';

  if v_src is null then
    raise exception 'M197: admin_operations_feed not found';
  end if;

  -- Already applied. Idempotent so a re-run is a no-op, not a second edit.
  if position('and d.cleared_at is null' in v_src) > 0 then
    raise notice 'M197: already applied';
    return;
  end if;

  -- Exactly one occurrence, or we do not know what we are editing.
  if (length(v_src) - length(replace(v_src, v_from, ''))) / length(v_from) <> 1 then
    raise exception 'M197: the delivery loop is not the shape this migration knows how to edit';
  end if;

  v_new := replace(v_src, v_from, v_to);
  if v_new = v_src then
    raise exception 'M197: substitution changed nothing';
  end if;

  execute v_new;
end $$;
