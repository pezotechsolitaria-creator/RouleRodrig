-- Admin store editing: profile, payment settings and store status, each behind
-- a validating SECURITY DEFINER function granted ONLY to service_role.
--
-- Authorization is by GRANT, following the pattern established in
-- m7_store_hours_admin_write_path: /admin has no Supabase user (signed cookie +
-- service role), so an in-function is_platform_admin() check can never pass.
-- The cookie gate in the route is the boundary; the grant is what makes these
-- unreachable from a customer session.
--
-- Validation lives HERE rather than only in the Zod schema so a bypassed route
-- still cannot store nonsense — the database stays the source of truth.

-- 1. Store profile.
create or replace function admin_update_store_profile(p_store_id uuid, p_patch jsonb)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_lat double precision;
  v_lng double precision;
begin
  if not exists (select 1 from stores s where s.id = p_store_id) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;

  if p_patch ? 'name' and coalesce(btrim(p_patch ->> 'name'), '') = '' then
    raise exception using errcode='RR005', message='A shop needs a name.';
  end if;

  -- GPS must be a real point on Earth, and both halves must move together.
  if p_patch ? 'lat' or p_patch ? 'lng' then
    v_lat := nullif(p_patch ->> 'lat','')::double precision;
    v_lng := nullif(p_patch ->> 'lng','')::double precision;
    if (v_lat is null) <> (v_lng is null) then
      raise exception using errcode='RR005', message='Set both latitude and longitude, or neither.';
    end if;
    if v_lat is not null and (v_lat < -90 or v_lat > 90 or v_lng < -180 or v_lng > 180) then
      raise exception using errcode='RR005', message='Those coordinates are not on Earth.';
    end if;
  end if;

  update stores s set
    name          = coalesce(nullif(btrim(p_patch ->> 'name'), ''), s.name),
    tagline       = case when p_patch ? 'tagline'     then nullif(btrim(p_patch ->> 'tagline'), '')     else s.tagline end,
    description   = case when p_patch ? 'description' then nullif(btrim(p_patch ->> 'description'), '') else s.description end,
    phone         = case when p_patch ? 'phone'       then nullif(btrim(p_patch ->> 'phone'), '')       else s.phone end,
    whatsapp      = case when p_patch ? 'whatsapp'    then nullif(btrim(p_patch ->> 'whatsapp'), '')    else s.whatsapp end,
    address       = case when p_patch ? 'address'     then nullif(btrim(p_patch ->> 'address'), '')     else s.address end,
    lat           = case when p_patch ? 'lat'         then nullif(p_patch ->> 'lat','')::double precision else s.lat end,
    lng           = case when p_patch ? 'lng'         then nullif(p_patch ->> 'lng','')::double precision else s.lng end,
    category_hint = case when p_patch ? 'category_hint' then nullif(btrim(p_patch ->> 'category_hint'), '') else s.category_hint end,
    updated_at    = now()
  where s.id = p_store_id;
end;
$$;

revoke execute on function admin_update_store_profile(uuid, jsonb) from public, anon, authenticated;

grant  execute on function admin_update_store_profile(uuid, jsonb) to service_role;

-- 2. Payment settings + fulfillment participation.
-- Mirrors the CHECK on store_payment_settings: bank transfer cannot be switched
-- on without the details a customer would need in order to actually pay.
create or replace function admin_update_store_payment(p_store_id uuid, p_patch jsonb)
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
    coalesce(nullif(btrim(p_patch ->> 'payment_instructions'), ''), v_cur.payment_instructions),
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

revoke execute on function admin_update_store_payment(uuid, jsonb) from public, anon, authenticated;

grant  execute on function admin_update_store_payment(uuid, jsonb) to service_role;

-- 3. Store visibility status. Distinct from MERCHANT approval, which lives on
-- merchants.status and is driven by the subscriptions route — the two are
-- different axes and the UI must label them separately.
create or replace function admin_set_store_status(p_store_id uuid, p_status text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (select 1 from stores s where s.id = p_store_id) then
    raise exception using errcode='RR003', message='Shop not found.';
  end if;
  if p_status not in ('draft','active','paused','holiday','closed') then
    raise exception using errcode='RR005', message='Unknown store status.';
  end if;
  update stores set status = p_status::store_status, updated_at = now() where id = p_store_id;
end;
$$;

revoke execute on function admin_set_store_status(uuid, text) from public, anon, authenticated;

grant  execute on function admin_set_store_status(uuid, text) to service_role;
