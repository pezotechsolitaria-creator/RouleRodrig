-- M67 — The admin operations feed.
--
-- WHY THIS IS NOT AN INBOX. The obvious build is rows in `notifications` with
-- recipient_type='admin'. It cannot work here: notifications.recipient_id is an
-- auth user, `platform_admins` is EMPTY, and the owner signs in with the
-- ADMIN_PASSWORD cookie — there is no auth.uid() to address a row to. Building
-- it that way would have produced a panel that silently shows nothing forever.
--
-- So this DERIVES from live state instead of accumulating messages. Better for
-- one operator anyway: nothing to mark read, nothing to fall out of sync, and
-- an item disappears when the problem is actually fixed rather than when
-- somebody clicks it. A decorative inbox tells you what happened; this tells
-- you what is wrong NOW.
--
-- M67b FOLDED IN: the first version selected nj.last_error and nj.updated_at.
-- notification_jobs has `error` and no updated_at at all, so the function
-- created cleanly and raised 42703 on the first call — the same "valid SQL,
-- wrong schema" failure as M65c. Read the column list; do not trust the name
-- you expect.
create or replace function public.admin_operations_feed()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_items jsonb := '[]'::jsonb;
  r record;
  v_set delivery_settings%rowtype;
begin
  -- The gate used everywhere in /admin: the cookie session arrives with the
  -- service role, where auth.uid() is NULL. A real signed-in user who is NOT a
  -- platform admin must be refused. is_platform_admin() alone would refuse the
  -- owner too — see the two-admin-identities note.
  if auth.uid() is not null and not is_platform_admin() then
    raise exception using errcode = '42501', message = 'Not permitted.';
  end if;

  select * into v_set from delivery_settings where id = 'main';

  for r in
    select d.id, d.status::text as status, o.order_number,
           extract(epoch from (now() - d.created_at))/60 as mins
      from deliveries d join orders o on o.id = d.order_id
     where d.status in ('requires_admin', 'driver_unresponsive', 'failed_delivery')
     order by d.created_at asc limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','critical','kind','delivery',
      'title', case r.status
                 when 'requires_admin' then 'Delivery needs you'
                 when 'driver_unresponsive' then 'Driver unresponsive'
                 else 'Failed delivery' end,
      'detail', format('Order %s, %s min old', r.order_number, round(r.mins)),
      'link','/admin/deliveries','id', r.id);
  end loop;

  for r in
    select d.id, o.order_number, d.offer_rounds,
           extract(epoch from (now() - d.created_at))/60 as mins
      from deliveries d join orders o on o.id = d.order_id
     where d.status = 'searching_driver'
       and d.created_at < now() - make_interval(mins => coalesce(v_set.accept_window_minutes, 10) * 2)
     limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','critical','kind','delivery','title','No driver yet',
      'detail', format('Order %s, %s min, %s rounds', r.order_number, round(r.mins), r.offer_rounds),
      'link','/admin/deliveries','id', r.id);
  end loop;

  for r in
    select h.name, extract(epoch from (now() - h.last_ok_at))/60 as mins
      from system_heartbeats h where h.last_ok_at < now() - interval '15 minutes'
  loop
    v_items := v_items || jsonb_build_object(
      'severity','critical','kind','system','title','Notification worker is down',
      'detail', format('No run for %s min. WhatsApp and delivery escalation have stopped.', round(r.mins)),
      'link','/admin/notifications','id', r.name);
  end loop;

  for r in
    select o.id, o.order_number, extract(epoch from (now() - o.created_at))/3600 as hours
      from orders o where o.status = 'awaiting_payment_confirmation'
     order by o.created_at asc limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','high','kind','payment','title','Payment proof to check',
      'detail', format('Order %s, waiting %s h', r.order_number, round(r.hours)),
      'link','/admin','id', r.id);
  end loop;

  for r in
    select dd.id, dd.full_name, extract(epoch from (now() - dd.created_at))/3600 as hours
      from delivery_drivers dd where dd.status = 'pending' limit 20
  loop
    v_items := v_items || jsonb_build_object(
      'severity','high','kind','driver','title','Driver application',
      'detail', format('%s, waiting %s h', r.full_name, round(r.hours)),
      'link','/admin/deliveries','id', r.id);
  end loop;

  -- `error` and `created_at` — the columns this table actually has.
  for r in
    select nj.id, nj.type, nj.error
      from notification_jobs nj
     where nj.status = 'failed' and nj.created_at > now() - interval '3 days'
     order by nj.created_at desc limit 10
  loop
    v_items := v_items || jsonb_build_object(
      'severity','notice','kind','system','title','Message never sent',
      'detail', format('%s — %s', r.type, coalesce(left(r.error, 80), 'no reason recorded')),
      'link','/admin/notifications','id', r.id);
  end loop;

  return jsonb_build_object(
    'items', v_items,
    'counts', jsonb_build_object(
      'critical', (select count(*) from jsonb_array_elements(v_items) e where e->>'severity'='critical'),
      'high',     (select count(*) from jsonb_array_elements(v_items) e where e->>'severity'='high'),
      'notice',   (select count(*) from jsonb_array_elements(v_items) e where e->>'severity'='notice')),
    'generatedAt', now());
end;
$function$;

revoke execute on function public.admin_operations_feed() from public, anon, authenticated;

-- Verified: the feed builds and returns well-formed counts under the service
-- role; a real signed-in non-admin is refused 42501, not merely shown an empty
-- list.
