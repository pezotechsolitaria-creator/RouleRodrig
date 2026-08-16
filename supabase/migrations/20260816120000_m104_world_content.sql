-- M104 — Independent worlds: one editable document per world.
--
-- ── WHY THIS IS NOT ANOTHER KEY IN site_content ─────────────────────────────
--
-- Every editorial change on this site currently rewrites ONE row: the whole of
-- `site_content.data`, in a single PUT. That is why two editors cannot work at
-- the same time (the later save silently reverts the earlier one), why there is
-- no such thing as a draft (saving IS publishing), and why a mistake can only
-- be undone by remembering what was there before.
--
-- A world gets its own row, and each row carries three documents:
--
--   draft      — what the editor is working on. Never public.
--   scheduled  — a FROZEN copy of the draft, taken when the editor schedules a
--                release, plus the moment it goes live.
--   published  — what the public reads.
--
-- The snapshot is the point of `scheduled` being its own column rather than a
-- date on the draft: once a release is scheduled, editing the draft again must
-- not silently change what is about to go out. Serving the snapshot from the
-- read function is also what makes scheduling work with NO cron job — the
-- release happens because the clock passed it, not because a worker woke up.

create table if not exists public.world_content (
  world         text primary key,
  draft         jsonb,
  scheduled     jsonb,
  scheduled_at  timestamptz,
  published     jsonb,
  published_at  timestamptz,
  published_by  text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

comment on table public.world_content is
  'One editable document per world (curated, stays, …). Read publicly only through world_published().';

-- Every save keeps the previous published document, so a bad publish is one
-- click from being undone. Bounded by a trim in the app, not by a policy here.
create table if not exists public.world_revisions (
  id          uuid primary key default gen_random_uuid(),
  world       text not null,
  data        jsonb not null,
  label       text,
  created_at  timestamptz not null default now(),
  created_by  text
);

create index if not exists world_revisions_world_created_idx
  on public.world_revisions (world, created_at desc);

-- ── Lock both tables away from the browser ──────────────────────────────────
--
-- RLS with no policy is NOT sufficient on its own here, and this is the trap
-- that has bitten this project before: a newly created table inherits default
-- privileges that reach `anon`, so "no policy" plus "a table grant" is a table
-- that answers with an empty set today and with the draft tomorrow if anyone
-- ever adds a permissive policy. The grants are removed explicitly, and the
-- removal is asserted at the bottom of this file.
--
-- service_role bypasses RLS, which is how the admin API (lib/supabase/admin)
-- reads and writes these rows.

alter table public.world_content  enable row level security;
alter table public.world_revisions enable row level security;

revoke all on public.world_content   from public, anon, authenticated;
revoke all on public.world_revisions from public, anon, authenticated;

-- ── The one public door ─────────────────────────────────────────────────────
--
-- The public site reads worlds through this function and nothing else. It can
-- return the published document or an already-released scheduled snapshot, and
-- has no way to reach a draft — which is the entire security property.
--
-- SECURITY DEFINER so it can read a table `anon` cannot; `search_path` pinned
-- so it cannot be redirected by a caller-set path.
create or replace function public.world_published(p_world text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
           when w.scheduled is not null
            and w.scheduled_at is not null
            and w.scheduled_at <= now()
           then w.scheduled
           else w.published
         end
  from public.world_content w
  where w.world = p_world;
$$;

comment on function public.world_published(text) is
  'The published (or already-released scheduled) document for a world. The only public read path; drafts are unreachable through it.';

-- EXECUTE on a new function is granted to PUBLIC by default, so "not granting
-- it" is not a control — it has to be taken away and then given back narrowly.
revoke all on function public.world_published(text) from public;
grant execute on function public.world_published(text) to anon, authenticated, service_role;

-- ── Assertions ──────────────────────────────────────────────────────────────
--
-- A migration that "succeeded" has only proved its SQL parsed. These call the
-- function as the role that will really call it, and prove the tables stayed
-- shut — the two things that have shipped broken here before.
do $$
begin
  -- 1. anon can call the accessor, and gets null for an unknown world rather
  --    than an error.
  set local role anon;
  if (select public.world_published('__does_not_exist__')) is not null then
    reset role;
    raise exception 'world_published() returned a document for a world that does not exist';
  end if;
  reset role;
end $$;

do $$
begin
  -- 2. anon cannot read the table the accessor reads from.
  begin
    set local role anon;
    perform 1 from public.world_content limit 1;
    reset role;
    raise exception 'world_content is SELECT-able by anon — the revoke did not take';
  exception
    when insufficient_privilege then
      reset role;
  end;
end $$;

do $$
begin
  -- 3. and neither can it read the revision history (old published documents).
  begin
    set local role anon;
    perform 1 from public.world_revisions limit 1;
    reset role;
    raise exception 'world_revisions is SELECT-able by anon — the revoke did not take';
  exception
    when insufficient_privilege then
      reset role;
  end;
end $$;
