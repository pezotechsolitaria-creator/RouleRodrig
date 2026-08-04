-- ============================================================================
-- 0008 — add_product_media(): atomic position assignment
-- ----------------------------------------------------------------------------
-- The API route previously computed the next gallery position as
-- "SELECT count(*) ... then INSERT position=count" in application code — a
-- read-then-write race: two photos uploaded concurrently for the same
-- product (e.g. a multi-select file picker firing parallel requests) could
-- both read the same count and both land on position 0. No unique
-- constraint catches this (it's a valid, just wrong, ordering), so it fails
-- silently rather than erroring — found by testing concurrent uploads
-- directly, not a hypothetical.
--
-- Fix: lock the parent product row (FOR UPDATE) before computing
-- MAX(position)+1, so concurrent calls for the SAME product serialize —
-- MAX() can't itself be used with FOR UPDATE (Postgres disallows FOR UPDATE
-- with aggregates), so the lock target is the product row, not the
-- product_media rows being aggregated.
-- ============================================================================

create or replace function add_product_media(p_product_id uuid, p_store_id uuid, p_url text)
returns table (media_id uuid, media_position integer)
language plpgsql security definer set search_path = public as $$
declare
  v_owner         uuid := auth.uid();
  v_next_position integer;
  v_media_id      uuid;
begin
  if v_owner is null then
    raise exception 'not authenticated';
  end if;
  if not is_store_staff(p_store_id) then
    raise exception using errcode = 'RR002', message = 'You do not have access to this shop.';
  end if;

  perform 1 from products where id = p_product_id and store_id = p_store_id for update;
  if not found then
    raise exception using errcode = 'RR002', message = 'That product doesn''t belong to this shop.';
  end if;

  select coalesce(max(position), -1) + 1 into v_next_position
  from product_media where product_id = p_product_id;

  insert into product_media (product_id, url, kind, position)
  values (p_product_id, p_url, 'image', v_next_position)
  returning id into v_media_id;

  return query select v_media_id, v_next_position;
end;
$$;

revoke execute on function add_product_media(uuid, uuid, text) from public;
revoke execute on function add_product_media(uuid, uuid, text) from anon;
grant execute on function add_product_media(uuid, uuid, text) to authenticated;
