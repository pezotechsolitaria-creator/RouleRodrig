-- M56 — Tell the tracking page when it is looking at a TICKET order.
--
-- M55 added isFood for the same reason: /orders/track is where guests land
-- after checkout, and it was written for the marketplace, so it offered
-- everybody "Continue shopping" into the shop directory. Food was fixed there;
-- events were not, and an event order is arguably worse to get wrong — a
-- ticket holder sent to a page of honey and baskets has no way back to the
-- thing they are actually waiting for.
--
-- Same asserted programmatic patch as M42/M50/M55, anchored on the isFood field
-- M55 introduced so the two sit together and the next person sees both.
do $blk$
declare
  v_def    text;
  v_anchor constant text := '''isFood'',        exists (select 1 from food_kitchens fk where fk.store_id = s.id),';
  v_new    text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'lookup_order';

  if v_def is null then
    raise exception 'M56: lookup_order() not found.';
  end if;
  if position('''isEvent''' in v_def) > 0 then
    raise notice 'M56: already applied, nothing to do.';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'M56: the M55 isFood field is not where it was. Re-read lookup_order() before patching — nothing was modified.';
  end if;

  v_new := replace(
    v_def,
    v_anchor,
    v_anchor || '
           -- M56: a ticket is not a product either. An event order sends the
           -- customer back to /events, and its "pickup" is a gate scan.
           ''isEvent'',       exists (select 1 from events ev where ev.store_id = s.id),'
  );

  -- The amendments that must survive: the bank block (M21) and the pickup code
  -- (M28), both verified present in the live definition before being asserted.
  if position('''bank''' in v_new) = 0
     or position('''pickupCode''' in v_new) = 0 then
    raise exception 'M56: the patched lookup_order() lost an earlier amendment. Aborting with nothing changed.';
  end if;

  execute v_new;
  raise notice 'M56: lookup_order() now reports isEvent.';
end $blk$;
