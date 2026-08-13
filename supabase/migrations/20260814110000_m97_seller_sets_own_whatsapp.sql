-- ── M97 — a seller can publish their own WhatsApp ─────────────────────────
--
-- M95/M96 made the shop's WhatsApp the escape hatch for a customer who cannot
-- make a local bank transfer. The ADMIN could always set it — /admin/stores has
-- had the field, wired end to end, all along. The SELLER could not, and that is
-- the half that matters: asking the owner to type a number for every shop on
-- the island is how the field stays empty.
--
-- WHY AN RPC AND NOT A GRANT. `authenticated` holds only SELECT on `stores`.
-- There IS an RLS policy — stores_staff_write, USING (is_store_staff(id) OR
-- is_platform_admin()) — and it has never once run, because a table GRANT is
-- checked BEFORE row security: with no UPDATE privilege the policy is never
-- consulted. That missing grant is a deliberate control (M8), not an oversight,
-- and granting UPDATE on `stores` to authenticated would hand every merchant
-- write access to status, slug, is_test, featured and merchant_id — RLS filters
-- ROWS, never columns, so the policy could not narrow it back down.
--
-- So: one narrow SECURITY DEFINER accessor that writes exactly one column,
-- gated on the same predicate the dead policy uses. The same shape as
-- set_store_payment_settings(), which exists for exactly this reason.
--
-- Verified as a real merchant: writing their OWN shop succeeds; the same call
-- against another merchant's shop raises RR003 "Shop not found" — not
-- "forbidden", so probing an id reveals nothing about whether it exists.
create or replace function public.set_store_whatsapp(p_store_id uuid, p_whatsapp text)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if p_store_id is null or not (is_store_staff(p_store_id) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Shop not found.';
  end if;

  update stores
     set whatsapp = nullif(btrim(coalesce(p_whatsapp, '')), '')
   where id = p_store_id;
end;
$function$;

revoke all on function public.set_store_whatsapp(uuid, text) from public;
grant execute on function public.set_store_whatsapp(uuid, text) to authenticated, service_role;
