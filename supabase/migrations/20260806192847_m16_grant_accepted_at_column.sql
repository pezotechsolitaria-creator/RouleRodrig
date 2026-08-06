-- M16 — Grant SELECT on orders.accepted_at.
--
-- THE BUG (mine, introduced in M14)
-- orders has NO table-level SELECT grant: M8 revoked it and re-granted column
-- by column, so that internal_notes could be withheld from customers while
-- everything else stayed readable. That means every column added afterwards is
-- unreadable by default — a safe default, but one that fails silently at the
-- design stage and loudly at runtime.
--
-- M14 added accepted_at and M15 started selecting it, so the merchant order
-- route hit "permission denied for table orders" and the dashboard showed
-- "Failed to load orders". Note the error names the TABLE, not the column,
-- which is why it read like an RLS problem: RLS was fine all along, and
-- has_column_privilege() was what actually located it.
--
-- auto_release_at was already granted (it predates the M8 lockdown), which is
-- why only the newer column broke.
--
-- LESSON WORTH KEEPING: on a table under a column-grant lockdown, `alter table
-- ... add column` is only half the change. The grant is the other half, and
-- nothing in Postgres reminds you.

grant select (accepted_at) on orders to authenticated;

do $$
begin
  if not has_column_privilege('authenticated', 'orders', 'accepted_at', 'SELECT') then
    raise exception 'M16: accepted_at still not readable by authenticated';
  end if;
  -- internal_notes must STAY withheld — this migration must not widen it.
  if has_column_privilege('authenticated', 'orders', 'internal_notes', 'SELECT') then
    raise exception 'M16: internal_notes became readable — column lockdown regressed';
  end if;
  if has_table_privilege('authenticated', 'orders', 'SELECT') then
    raise exception 'M16: a table-level SELECT grant reappeared on orders, defeating the column lockdown';
  end if;
end;
$$;
