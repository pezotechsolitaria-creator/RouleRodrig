-- orders.internal_notes is the merchant's PRIVATE note about an order — the
-- original migration says so explicitly. But orders_read grants row access to
-- `customer_id = auth.uid()`, and `authenticated` still held a column-level
-- SELECT on internal_notes, so a customer could read the shop's private note
-- about themselves straight through PostgREST with the browser key:
--
--   supabase.from('orders').select('internal_notes').eq('id', <their order>)
--
-- Reproduced on live data before this migration. The application layer was
-- careful never to select the column, but a column grant defeats application
-- care entirely — the trust boundary is the database, not the route.
--
-- Reads now go through a SECURITY DEFINER accessor that checks store staff
-- membership independently of RLS, and the raw column grants are withdrawn.
-- Writes are unaffected: they already go through update_order_status(), which
-- is itself SECURITY DEFINER, so it does not need the caller's column grant.
create or replace function order_internal_notes(p_order_id uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_store uuid;
  v_notes text;
begin
  select o.store_id, o.internal_notes into v_store, v_notes
  from orders o where o.id = p_order_id;

  if v_store is null then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;
  -- Deliberately the same error for "does not exist" and "not yours", so this
  -- cannot be used to probe which order IDs are real.
  if not (is_store_staff(v_store) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Order not found.';
  end if;

  return v_notes;
end;
$$;

revoke execute on function order_internal_notes(uuid) from public, anon;
grant execute on function order_internal_notes(uuid) to authenticated;

revoke select (internal_notes), update (internal_notes) on orders from anon, authenticated;
