-- The column from m193 with nothing writing to it is not a fix. This is the
-- half that captures it.
--
-- ── DROP BEFORE CREATE, DELIBERATELY ──────────────────────────────────────
-- Adding a parameter — even a defaulted one — to a live function creates a
-- SECOND overload rather than replacing the first, and PostgREST then refuses
-- the endpoint outright with PGRST203. That has already cost this project a
-- working RPC once. The old signature goes first, in the same transaction, so
-- there is never a moment with two.
drop function if exists public.attach_delivery_payment_proof(uuid, text, text, text);

create or replace function public.attach_delivery_payment_proof(
  p_request_id uuid,
  p_path text,
  p_reference text default null,
  p_email text default null,
  -- Minor units, and the CUSTOMER'S CLAIM — not a verified figure. Nothing in
  -- this system can verify it; what it does is give the receipt something to
  -- be checked against, which it has never had. Optional, because somebody
  -- photographing a bank slip at the counter should not be blocked on typing
  -- a number that is already in the picture.
  p_amount integer default null
) returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_d deliveries%rowtype;
  v_req delivery_requests%rowtype;
begin
  if coalesce(btrim(p_path), '') = '' then
    raise exception 'Attach the proof of payment.' using errcode = 'P0001';
  end if;
  if p_path !~ '^delivery-payments/[0-9a-f-]{36}/[A-Za-z0-9._-]+$' then
    raise exception 'That file could not be attached.' using errcode = 'P0001';
  end if;
  if p_amount is not null and p_amount < 0 then
    raise exception 'That amount is not a number we can use.' using errcode = 'P0001';
  end if;

  select * into v_req from delivery_requests where id = p_request_id;
  if not found then
    raise exception 'That request no longer exists.' using errcode = 'P0001';
  end if;

  -- Ownership: the session, or the guest email. Same shape as everywhere else,
  -- and deliberately the same vague message for both misses.
  if auth.uid() is not null and v_req.customer_id = auth.uid() then
    null;
  elsif p_email is not null
        and v_req.guest_email is not null
        and lower(btrim(v_req.guest_email)) = lower(btrim(p_email)) then
    null;
  else
    raise exception 'That request no longer exists.' using errcode = 'P0001';
  end if;

  select * into v_d from deliveries where request_id = p_request_id;
  if not found then
    raise exception 'Choose a driver first.' using errcode = 'P0001';
  end if;
  if v_d.payment_method is distinct from 'bank_transfer' then
    raise exception 'This delivery is being paid in cash.' using errcode = 'P0001';
  end if;
  -- Not after it is over. NOT "only while assigned" — see m192.
  if v_d.status in ('delivered', 'cancelled', 'failed_delivery', 'returned_to_merchant') then
    raise exception 'This delivery is finished.' using errcode = 'P0001';
  end if;

  update deliveries
     set payment_proof_path = p_path,
         payment_proof_at = now(),
         payment_reference = nullif(btrim(coalesce(p_reference, '')), ''),
         -- coalesce, so re-attaching a clearer photo without retyping the
         -- amount does not erase the amount.
         payment_amount = coalesce(p_amount, payment_amount),
         updated_at = now()
   where id = v_d.id;

  perform log_delivery_event(
    v_d.id, 'customer', v_req.customer_id, 'delivery.payment_proof_attached',
    v_d.status, v_d.status, null,
    jsonb_build_object('reference', p_reference, 'amount', p_amount)
  );
  return true;
end;
$function$;

revoke all on function public.attach_delivery_payment_proof(uuid, text, text, text, integer) from public, anon;
grant execute on function public.attach_delivery_payment_proof(uuid, text, text, text, integer) to authenticated, service_role;

-- Verified against production, rolled back:
--   wrong email     -> P0001 That request no longer exists.
--   bad path        -> P0001 That file could not be attached.
--   negative amount -> P0001 That amount is not a number we can use.
--   a cash delivery -> P0001 This delivery is being paid in cash.
