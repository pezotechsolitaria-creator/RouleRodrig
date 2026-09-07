-- ── A KITCHEN CAN HAVE AN OWNER, NOT ONLY COOKS ────────────────────────────
--
-- kitchen_staff.role is text DEFAULT 'cook', and admin_add_kitchen_staff has
-- never passed a role -- its INSERT names four columns and role is not one of
-- them. So EVERY person the product has ever added to a kitchen became a cook,
-- including the person who owns the restaurant.
--
-- app/kitchen/page.tsx decides from `kitchen_staff.role = 'owner'` whether to
-- show "Add or edit dishes", "Today's menu", "Payments & delivery" and
-- "Opening hours", and passes the same flag to MenuPanel as `canManage`, which
-- gates the "Add a dish" and "Edit dish" buttons. A restaurant owner was
-- therefore shown the cook's screen with no route to their own menu. That is
-- what "I still cannot add a dish, edit dish in menu" was: not a broken button,
-- a column default.
--
-- DROP then CREATE, rather than CREATE OR REPLACE with a new defaulted
-- argument. Adding a defaulted parameter does not replace the function, it
-- creates a SECOND one alongside the old three-argument version, and PostgREST
-- then refuses the endpoint outright with PGRST203. This project has already
-- lost an afternoon to exactly that.

drop function if exists public.admin_add_kitchen_staff(uuid, text, text);

create function public.admin_add_kitchen_staff(
  p_store_id uuid,
  p_email    text,
  p_name     text,
  p_role     text default 'cook'
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id    uuid;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_role  text := lower(btrim(coalesce(p_role, 'cook')));
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode = 'RR005', message = 'Enter a valid email address.';
  end if;

  -- Checked here rather than left to the column's CHECK constraint, so a
  -- caller gets a sentence a person can read instead of a 23514.
  if v_role not in ('owner', 'cook') then
    raise exception using errcode = 'RR006', message = 'Role must be owner or cook.';
  end if;

  if not exists (select 1 from food_kitchens fk where fk.store_id = p_store_id) then
    raise exception using errcode = 'RR003', message = 'That shop is not a kitchen.';
  end if;

  insert into kitchen_staff (store_id, invite_email, display_name, added_by, role)
  values (p_store_id, v_email, coalesce(nullif(btrim(p_name), ''), v_email), auth.uid(), v_role)
  on conflict (store_id, invite_email) do update
    set display_name = excluded.display_name,
        -- Re-adding somebody is how an admin changes their role. Without this
        -- line a cook could never be promoted to owner through the product,
        -- which is the hole that made this migration necessary in the first
        -- place -- the only fix would again be hand-written SQL.
        role = excluded.role
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'email', v_email, 'role', v_role);
end;
$function$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and this database ALSO grants it to
-- `anon` and `authenticated` by ALTER DEFAULT PRIVILEGES. Those are explicit
-- grants to named roles, so REVOKE ... FROM PUBLIC does not remove them -- the
-- roles have to be named. Verified after applying: the function came out
-- executable by anon until these three lines ran.
--
-- It is SECURITY DEFINER and it writes kitchen_staff, the table that decides
-- who may edit a restaurant's menu, prices and opening hours. The predecessor
-- was granted to service_role alone; keep exactly that.
revoke all on function public.admin_add_kitchen_staff(uuid, text, text, text) from public;
revoke all on function public.admin_add_kitchen_staff(uuid, text, text, text) from anon;
revoke all on function public.admin_add_kitchen_staff(uuid, text, text, text) from authenticated;
grant execute on function public.admin_add_kitchen_staff(uuid, text, text, text) to service_role;
