-- Bank details could never be erased.
--
-- store_payment_write_internal resolved every text field with
--   coalesce(nullif(btrim(p_patch ->> 'bank_name'), ''), v_cur.bank_name)
-- which conflates two different intents: "the caller did not mention this
-- field" (keep it) and "the caller explicitly set it to null" (clear it). Both
-- fell through to the current value, so once an account number was stored there
-- was no way to remove it through any code path.
--
-- Found by using the admin payment RPC to strip the test shop's fake details:
-- the update reported success, bank transfer switched off, and MCB /
-- 000123456789 were still sitting in the row.
--
-- Beyond the cleanup this is a retention problem: a merchant who stops taking
-- bank transfer, or who asks for their details to be removed, could not have
-- them removed.
--
-- Fix: use `p_patch ? 'field'` to distinguish absent from explicitly-null, the
-- same way admin_update_store_profile already does. Absent keeps, null clears.
create or replace function store_payment_write_internal(p_store_id uuid, p_patch jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_cur   store_payment_settings%rowtype;
  v_cash  boolean; v_bank boolean;
  v_bname text; v_holder text; v_acct text; v_instr text;
begin
  if not exists (select 1 from stores s where s.id = p_store_id) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;

  select * into v_cur from store_payment_settings where store_id = p_store_id;

  v_cash := coalesce((p_patch ->> 'accepts_cash')::boolean,          v_cur.accepts_cash,          true);
  v_bank := coalesce((p_patch ->> 'accepts_bank_transfer')::boolean, v_cur.accepts_bank_transfer, false);

  -- Present-but-null clears; absent keeps.
  v_bname  := case when p_patch ? 'bank_name'            then nullif(btrim(p_patch ->> 'bank_name'), '')            else v_cur.bank_name end;
  v_holder := case when p_patch ? 'account_holder'       then nullif(btrim(p_patch ->> 'account_holder'), '')       else v_cur.account_holder end;
  v_acct   := case when p_patch ? 'account_number'       then nullif(btrim(p_patch ->> 'account_number'), '')       else v_cur.account_number end;
  v_instr  := case when p_patch ? 'payment_instructions' then nullif(btrim(p_patch ->> 'payment_instructions'), '') else v_cur.payment_instructions end;

  if not v_cash and not v_bank then
    raise exception using errcode='RR005', message='A shop must accept at least one payment method.';
  end if;
  -- Still enforced: bank transfer cannot be ON without the details a customer
  -- would need in order to pay. Clearing them is only allowed alongside
  -- switching it off, which is exactly the intended flow.
  if v_bank and (v_bname is null or v_holder is null or v_acct is null) then
    raise exception using errcode='RR005',
      message='Bank name, account holder and account number are all required for bank transfer.';
  end if;

  insert into store_payment_settings as sp (
    store_id, accepts_cash, accepts_bank_transfer, bank_name, account_holder, account_number,
    payment_instructions, require_receipt, offers_rr_delivery, offers_pickup, offers_customer_delivery
  ) values (
    p_store_id, v_cash, v_bank, v_bname, v_holder, v_acct, v_instr,
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
