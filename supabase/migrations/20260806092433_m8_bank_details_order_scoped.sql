-- Bank details stop being readable by every signed-in user.
--
-- store_payment_settings_customer_read is `store_is_visible(store_id) OR
-- is_store_staff(...) OR is_platform_admin()`. Because visibility is the test,
-- any logged-in customer could read bank_name / account_holder /
-- account_number for EVERY live shop, without ordering anything. Verified:
-- anon correctly saw 0 rows, an unrelated authenticated user saw the full
-- details. Account numbers are not secrets in the way a password is — you hand
-- them to anyone who pays you — but marketplace-wide harvesting of
-- (shop, holder, account) is exactly the raw material for targeted
-- impersonation, so it should not be one query away.
--
-- The row stays visible. Only the SENSITIVE COLUMNS are withdrawn, because the
-- booleans on this row (accepts_cash, accepts_bank_transfer, offers_*) are what
-- the storefront and checkout legitimately read to decide which options to show.
-- Killing the whole row would have silently broken payment-method gating.
--
-- Same shape as the M7 internal_notes fix: a SECURITY DEFINER accessor plus
-- column grants, since a column-level REVOKE is a no-op under a table grant.
--
-- Verified first: the only customer-side read of these fields is
-- app/orders/[id]/page.tsx, where an order already exists — so scoping access
-- to "you have an order with this shop" breaks nothing.
create or replace function store_bank_details(p_store_id uuid)
returns table (
  bank_name text, account_holder text, account_number text,
  payment_instructions text, require_receipt boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_store_id is null then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;

  -- Staff and platform admins always. A customer only once they have placed an
  -- order there — which is also the only moment the UI needs to show them.
  if not (
    is_store_staff(p_store_id)
    or is_platform_admin()
    or exists (
      select 1 from orders o
      where o.store_id = p_store_id and o.customer_id = auth.uid()
    )
  ) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;

  return query
    select sp.bank_name, sp.account_holder, sp.account_number,
           sp.payment_instructions, sp.require_receipt
    from store_payment_settings sp
    where sp.store_id = p_store_id;
end;
$$;

revoke execute on function store_bank_details(uuid) from public, anon;

grant  execute on function store_bank_details(uuid) to authenticated;

-- Withhold the sensitive columns. Table-level SELECT must go first: a
-- column-level revoke cannot subtract from a table grant.
do $do$
declare cols text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema='public' and table_name='store_payment_settings'
    and column_name not in ('bank_name','account_holder','account_number','payment_instructions');

  if cols is null or cols = '' then
    raise exception 'could not enumerate store_payment_settings columns — refusing to revoke blindly';
  end if;

  revoke select on store_payment_settings from anon, authenticated;
  execute format('grant select (%s) on store_payment_settings to anon, authenticated', cols);
end
$do$;
