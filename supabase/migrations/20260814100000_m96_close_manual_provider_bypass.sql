-- ── M96 — the door M89 left open ──────────────────────────────────────────
--
-- M89 removed cash so nothing is handed over before the money arrives. It
-- gated `cash` in three places and left `manual` alone, because `manual` is
-- documented as "a merchant recording an offline settlement themselves" — a
-- merchant-side record, not a checkout option.
--
-- It was reachable from checkout. Proven against production, not suspected:
--
--   · /api/checkout passes `provider` straight from the request body, and for
--     a GUEST it calls create_order through getPrivileged() — service_role.
--   · create_order checks accepts_cash for cash and accepts_bank_transfer for
--     bank_transfer, and checks NOTHING for manual.
--   · with Ti Kitchen configured to offer nothing at all (cash off by M89,
--     bank transfer never enabled — the exact state of three live shops),
--     provider='manual' created order RR260813-864D2E with stock reserved.
--
-- The whole of M89 undone by one string in a POST body: an unpaid order, at a
-- shop with no payment method, from an anonymous caller. A unit test was
-- asserting that checkout ACCEPTS manual, which is how it survived M89's
-- review — the test encoded the vulnerability as correct behaviour.
--
-- THE GATE IS `manual` + `pending`, NOT `manual`. That distinction is the
-- meaning of the word: a merchant recording money already received writes it
-- CAPTURED. A PENDING manual is a promise to pay later, which is precisely
-- what M89 abolished. Every manual row in this database is captured, so this
-- refuses nothing that has ever legitimately happened.
--
-- Kept in the same trigger as cash because it is the same rule, and two
-- triggers for one rule is how they drift apart.
--
-- Verified after applying: the exact call that created RR260813-864D2E now
-- raises RR017, while a pending bank_transfer, a captured manual, and an
-- update to a pre-M89 cash row all still succeed.
create or replace function public.refuse_cash_when_prepayment_only()
returns trigger
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if not prepayment_only() then
    return new;
  end if;

  -- New cash money. An UPDATE leaving an existing cash row as cash still works,
  -- or every pre-switch order becomes impossible to finish.
  if new.provider = 'cash'
     and (tg_op = 'INSERT' or old.provider is distinct from 'cash') then
    raise exception using errcode = 'RR017',
      message = 'Orders are paid in advance by bank transfer. Cash on collection is not available.';
  end if;

  -- A manual payment that has NOT been received is an unpaid order wearing a
  -- different label. Recording one that HAS been received stays allowed.
  if new.provider = 'manual' and new.status = 'pending' then
    raise exception using errcode = 'RR017',
      message = 'A manual payment can only be recorded once the money has actually been received.';
  end if;

  return new;
end;
$function$;

-- `status` joins the watch list: a row inserted captured and later moved to
-- pending would otherwise slip past a provider-only trigger.
drop trigger if exists payments_refuse_cash on public.payments;
create trigger payments_refuse_cash
  before insert or update of provider, status on public.payments
  for each row execute function public.refuse_cash_when_prepayment_only();
