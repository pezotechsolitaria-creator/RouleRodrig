-- Fixes a regression introduced by m8_bank_details_order_scoped.
--
-- Withdrawing SELECT on the bank columns also broke the MERCHANT's own payment
-- settings page: its GET selects those columns with the user's client, and even
-- its UPDATE read them (an `update ... set bank_name = bank_name` needs SELECT
-- on the column it reads). Verified as the real shop owner: both 42501.
--
-- Rather than hand the columns back, payment settings adopt the same two-door
-- shape already used for store hours:
--   store_payment_write_internal — validation + upsert. Executable by nobody.
--   set_store_payment_settings   — merchant door, checks staff.  -> authenticated
--   admin_update_store_payment   — platform door, grant IS the authorization.
--                                                                -> service_role
-- One implementation, two front doors, so merchant and admin validation cannot
-- drift — and the sensitive columns stay unreadable by ordinary table access.
create or replace function store_payment_write_internal(p_store_id uuid, p_patch jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cur   store_payment_settings%rowtype;
  v_cash  boolean; v_bank boolean;
  v_bname text; v_holder text; v_acct text;
begin
  if not exists (select 1 from stores s where s.id = p_store_id) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;

  select * into v_cur from store_payment_settings where store_id = p_store_id;

  v_cash   := coalesce((p_patch ->> 'accepts_cash')::boolean,          v_cur.accepts_cash,          true);
  v_bank   := coalesce((p_patch ->> 'accepts_bank_transfer')::boolean, v_cur.accepts_bank_transfer, false);
  v_bname  := coalesce(nullif(btrim(p_patch ->> 'bank_name'), ''),      v_cur.bank_name);
  v_holder := coalesce(nullif(btrim(p_patch ->> 'account_holder'), ''), v_cur.account_holder);
  v_acct   := coalesce(nullif(btrim(p_patch ->> 'account_number'), ''), v_cur.account_number);

  if not v_cash and not v_bank then
    raise exception using errcode='RR005', message='A shop must accept at least one payment method.';
  end if;
  if v_bank and (v_bname is null or v_holder is null or v_acct is null) then
    raise exception using errcode='RR005',
      message='Bank name, account holder and account number are all required for bank transfer.';
  end if;

  insert into store_payment_settings as sp (
    store_id, accepts_cash, accepts_bank_transfer, bank_name, account_holder, account_number,
    payment_instructions, require_receipt, offers_rr_delivery, offers_pickup, offers_customer_delivery
  ) values (
    p_store_id, v_cash, v_bank, v_bname, v_holder, v_acct,
    case when p_patch ? 'payment_instructions'
         then nullif(btrim(p_patch ->> 'payment_instructions'), '') else v_cur.payment_instructions end,
    coalesce((p_patch ->> 'require_receipt')::boolean,          v_cur.require_receipt,          false),
    coalesce((p_patch ->> 'offers_rr_delivery')::boolean,       v_cur.offers_rr_delivery,       true),
    coalesce((p_patch ->> 'offers_pickup')::boolean,            v_cur.offers_pickup,            true),
    coalesce((p_patch ->> 'offers_customer_delivery')::boolean, v_cur.offers_customer_delivery, true)
  )
  on conflict (store_id) do update set
    accepts_cash             = excluded.accepts_cash,
    accepts_bank_transfer    = excluded.accepts_bank_transfer,
    bank_name                = excluded.bank_name,
    account_holder           = excluded.account_holder,
    account_number           = excluded.account_number,
    payment_instructions     = excluded.payment_instructions,
    require_receipt          = excluded.require_receipt,
    offers_rr_delivery       = excluded.offers_rr_delivery,
    offers_pickup            = excluded.offers_pickup,
    offers_customer_delivery = excluded.offers_customer_delivery,
    updated_at               = now();
end;
$$;

revoke execute on function store_payment_write_internal(uuid, jsonb) from public, anon, authenticated, service_role;

-- Merchant door.
create or replace function set_store_payment_settings(p_store_id uuid, p_patch jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not (is_store_staff(p_store_id) or is_platform_admin()) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;
  perform store_payment_write_internal(p_store_id, p_patch);
end;
$$;

revoke execute on function set_store_payment_settings(uuid, jsonb) from public, anon;

grant  execute on function set_store_payment_settings(uuid, jsonb) to authenticated;

-- Platform door, re-pointed at the shared implementation.
create or replace function admin_update_store_payment(p_store_id uuid, p_patch jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform store_payment_write_internal(p_store_id, p_patch);
end;
$$;

revoke execute on function admin_update_store_payment(uuid, jsonb) from public, anon, authenticated;

grant  execute on function admin_update_store_payment(uuid, jsonb) to service_role;
