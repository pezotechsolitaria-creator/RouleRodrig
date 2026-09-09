-- ── M193: A FINISHED REQUEST STOPS FOLLOWING THE CUSTOMER AROUND ────────────
--
-- "Auto-delete / auto-archive completed or expired requests after 30 days
--  (configurable)."
--
-- Today nothing ever leaves my_delivery_requests(). A customer who has used
-- /deliver a dozen times opens their list and reads a year of cancelled and
-- delivered jobs above the one they are waiting on, newest-window-first, with
-- no way to clear any of it.
--
-- ── ARCHIVE, NOT DELETE, AND THE DISTINCTION MATTERS ────────────────────────
-- These rows are the customer's own record of money they paid and the driver
-- who took it, and deliveries hang off them by foreign key. Deleting would
-- either cascade into somebody's delivery history or fail on the constraint.
-- So `archived_at` is stamped and the LIST stops showing it; the request keeps
-- existing and its own URL keeps working, which is what a receipt is for.
--
-- ── WHY NOTHING LIVE CAN BE CAUGHT BY THIS ──────────────────────────────────
-- The predicate is deliberately narrow, because archiving a job somebody is
-- waiting on would be far worse than never archiving anything:
--
--   cancelled / expired          finished by definition
--   accepted + delivery over     the driver's row reached a terminal status
--   open                         NEVER. An open request is live work, whatever
--                                its age; expiry is expire_delivery_request()'s
--                                job and it has its own sweep.
--
-- The window is the owner's, beside id_document_retention_days which already
-- works this way. 0 turns it off entirely rather than meaning "archive
-- everything immediately" -- the reading that would empty the table.

alter table delivery_settings
  add column if not exists request_archive_days int not null default 30;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'delivery_settings_archive_days_sane'
  ) then
    alter table delivery_settings
      add constraint delivery_settings_archive_days_sane
      check (request_archive_days >= 0 and request_archive_days <= 3650);
  end if;
end $$;

alter table delivery_requests
  add column if not exists archived_at timestamptz;

-- Partial: the rows this is ever asked about are the unarchived ones.
create index if not exists delivery_requests_unarchived_idx
  on delivery_requests (customer_id)
  where archived_at is null;

create or replace function public.archive_old_delivery_requests(p_limit int default 500)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_days int;
  v_n    int;
begin
  select request_archive_days into v_days from delivery_settings where id = 'main';
  -- No settings row, or the owner switched it off. Both mean "do nothing",
  -- and neither is an error worth failing a nightly cron over.
  if v_days is null or v_days <= 0 then
    return jsonb_build_object('archived', 0, 'days', v_days);
  end if;

  with due as (
    select r.id
      from delivery_requests r
     where r.archived_at is null
       and r.updated_at < now() - make_interval(days => v_days)
       and (
         r.status in ('cancelled', 'expired')
         or (
           r.status = 'accepted'
           and exists (
             select 1 from deliveries d
              where d.request_id = r.id
                and d.status in ('delivered', 'cancelled', 'failed_delivery',
                                 'returned_to_merchant')
           )
           and not exists (
             -- Belt and braces: if ANY delivery on this request is still
             -- moving, the request is not finished no matter how old it is.
             select 1 from deliveries d
              where d.request_id = r.id
                and d.status in ('searching_driver', 'assigned', 'going_to_pickup',
                                 'arrived_at_pickup', 'picked_up',
                                 'out_for_delivery', 'arrived')
           )
         )
       )
     order by r.updated_at
     limit greatest(p_limit, 0)
  )
  update delivery_requests r
     set archived_at = now()
    from due
   where r.id = due.id;

  get diagnostics v_n = row_count;
  return jsonb_build_object('archived', v_n, 'days', v_days);
end;
$function$;

revoke all on function public.archive_old_delivery_requests(int) from public, anon, authenticated;

-- ── And the list stops showing them ─────────────────────────────────────────
-- Rebuilt from pg_get_functiondef(), not from the .sql that created it, per
-- CLAUDE.md: the deployed body is the truth and this one had already drifted
-- from its migration once.
create or replace function public.my_delivery_requests()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'kind', r.kind,
           'what', r.what,
           'status', r.status,
           'pickupText', r.pickup_text,
           'dropoffText', r.dropoff_text,
           'createdAt', r.created_at,
           'expiresAt', r.expires_at,
           'scheduleKind', r.schedule_kind,
           'timeSlot', r.time_slot,
           'windowStart', r.window_start,
           'windowEnd', r.window_end,
           'deliveryStatus', (select d.status from deliveries d
                               where d.request_id = r.id
                               order by d.created_at desc limit 1),
           'quoteCount', (select count(*) from delivery_quotes q
                           where q.request_id = r.id and q.status = 'offered'),
           'bestQuote', (select min(q.fee) from delivery_quotes q
                          where q.request_id = r.id and q.status = 'offered'))
         order by greatest(r.window_start, now()) asc, r.created_at desc), '[]'::jsonb)
    from delivery_requests r
   where auth.uid() is not null
     and r.customer_id = auth.uid()
     and r.archived_at is null;
$function$;
