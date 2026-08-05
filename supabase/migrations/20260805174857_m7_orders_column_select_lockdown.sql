-- Second half of the internal_notes fix. The first migration revoked the
-- COLUMN-level select, which was a no-op: anon and authenticated also hold a
-- TABLE-level SELECT on orders (the Supabase default blanket grant), and a
-- table-level grant implies every column, so a column-level revoke cannot
-- subtract from it. Verified live — the customer could still read the note
-- after that migration.
--
-- The only way to withhold one column is to drop the table-level SELECT and
-- re-grant the permitted columns explicitly. The column list is generated from
-- the catalogue rather than typed out, so no existing column can be missed.
--
-- MAINTENANCE: a column added to `orders` later will NOT be readable by the
-- app until it is granted. That is the deliberate trade for column privacy —
-- if a future migration adds a column and reads start failing with 42501, the
-- fix is `grant select (new_column) on orders to anon, authenticated;`.
--
-- DELETE and TRUNCATE are dropped at the same time. Nothing in the application
-- deletes an order (verified by grep), orders are cancelled by status, and
-- TRUNCATE in particular is NOT subject to row-level security — so leaving it
-- granted to anon meant RLS was not actually the last line of defence there.
do $do$
declare
  cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'orders'
    and column_name <> 'internal_notes';

  if cols is null or cols = '' then
    raise exception 'could not enumerate orders columns — refusing to revoke blindly';
  end if;

  revoke select, delete, truncate on orders from anon, authenticated;
  execute format('grant select (%s) on orders to anon, authenticated', cols);
end
$do$;
