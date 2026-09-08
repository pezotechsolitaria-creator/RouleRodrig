-- ── "BANK TRANSFER" WITH NOWHERE TO SEND IT ────────────────────────────────
--
-- /deliver offers two ways to pay. One of them has never had a destination.
--
-- The customer picks "Bank transfer", is told "Send it now, then attach the
-- receipt", and is never shown an account — because no account exists anywhere
-- in this flow. Greps across app/deliver, lib/delivery and
-- app/api/delivery-requests for account_number / bank_name / iban / swift /
-- payment_instructions return NOTHING, while the same fields appear in twenty
-- files on the marketplace, events and stores side.
--
-- store_payment_settings cannot help: it is per-shop, Deliver Anything has no
-- shop, and its RLS deliberately covers every visible store — granting SELECT
-- on it would publish every merchant's bank account.
--
-- ── WHY THIS IS WORSE THAN A MISSING FEATURE ──────────────────────────────
-- Cash is capped at cash_limit_cents, Rs 3,000. Above that the sheet greys the
-- cash option out and leaves bank transfer as the only choice — a choice that
-- leads to a screen asking for a receipt for a payment the customer had no way
-- to make. Two of the requests posted on 8 September carried Rs 5,000 quotes,
-- which is exactly that dead end.
--
-- So the platform gets one account, on the settings row that already holds
-- every other Deliver Anything rule. Left NULL on purpose: the owner types
-- their own details in, and until they do the UI must not offer a transfer at
-- all. An empty destination is the one state this feature must never present
-- as working.
alter table delivery_settings
  add column if not exists bank_account_name   text,
  add column if not exists bank_name           text,
  add column if not exists bank_account_number text,
  add column if not exists bank_note           text;

comment on column delivery_settings.bank_account_name is
  'Who the transfer is made out to. NULL means bank transfer is not set up and must not be offered.';
comment on column delivery_settings.bank_note is
  'Free text under the account, e.g. a reference convention. Optional.';

-- The customer's own view carries them. Not a public read: delivery_request_view
-- already proves ownership by session or by guest email before it returns
-- anything at all, and this is the platform's own receiving account — the
-- number you would print on an invoice — not a merchant's.
do $$
declare
  v_def text;
  v_old constant text := E'    ''cancelReason'', v_r.cancel_reason,';
  v_new constant text := E'    ''cancelReason'', v_r.cancel_reason,\n'
    || E'    -- Where to send a bank transfer. NULL as a whole when the account\n'
    || E'    -- has not been set up, which is what stops the UI offering it.\n'
    || E'    ''bankDetails'', (\n'
    || E'      select case when coalesce(btrim(s.bank_account_name), '''') = '''' then null\n'
    || E'                  else jsonb_build_object(\n'
    || E'                    ''accountName'', s.bank_account_name,\n'
    || E'                    ''bankName'', s.bank_name,\n'
    || E'                    ''accountNumber'', s.bank_account_number,\n'
    || E'                    ''note'', s.bank_note) end\n'
    || E'        from delivery_settings s where s.id = ''main''),';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'delivery_request_view';

  if v_def is null then
    raise exception 'delivery_request_view not found';
  end if;

  -- Already applied. Re-running is a no-op.
  if position('''bankDetails''' in v_def) > 0 then
    return;
  end if;

  if position(v_old in v_def) = 0 then
    raise exception 'the view shape moved — refusing to rewrite blind';
  end if;

  v_def := replace(v_def, v_old, v_new);

  if (select count(*) from regexp_matches(v_def, '''bankDetails''', 'g')) <> 1 then
    raise exception 'expected exactly one bankDetails block';
  end if;

  execute v_def;
end $$;
