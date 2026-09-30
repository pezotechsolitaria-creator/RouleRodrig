-- ── M228: THE ADMIN SEES WHAT A CUSTOMER CLEARED ────────────────────────────
--
-- M227 let a customer clear a request from their own list; the admin board
-- kept showing it, by design. Without a mark, though, the desk cannot tell a
-- request the customer has walked away from — still open to drivers, still
-- collecting prices nobody will look at — from one they are watching. So both
-- admin views that list requests now carry `customerHiddenAt`, and the UI
-- shows "Hidden by customer" on those rows.
--
-- ── PATCHED FROM THE DEPLOYED BODY, WITH GUARDS ─────────────────────────────
-- Both functions are long and have drifted from their migrations before
-- (CLAUDE.md: the deployed body is the truth). Rather than retype ~200 lines
-- and risk a transcription change in something the desk runs on, each is read
-- back with pg_get_functiondef(), gets ONE key inserted before an anchor that
-- appears exactly once, and is re-executed. If an anchor is missing or
-- repeated the migration raises instead of silently doing nothing.

do $$
declare
  v_def text;
  v_anchor text;
begin
  -- admin_delivery_board: the live delivery card (via its request) …
  v_def := pg_get_functiondef('public.admin_delivery_board'::regproc);
  -- Idempotent: a second run must not insert the key twice.
  if position('customerHiddenAt' in v_def) = 0 then
  v_anchor := '''offersOut'', (select count(*) from delivery_offers o2';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'M228: admin_delivery_board live anchor not found exactly once';
  end if;
  v_def := replace(v_def, v_anchor,
    '''customerHiddenAt'', (select h.hidden_at from delivery_request_hidden h where h.request_id = d.request_id),' || chr(10) ||
    '                 ' || v_anchor);

  -- … and the open-request card.
  v_anchor := '''waitingMinutes'', round(extract(epoch from (now() - r.created_at)) / 60),';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'M228: admin_delivery_board requests anchor not found exactly once';
  end if;
  v_def := replace(v_def, v_anchor,
    '''customerHiddenAt'', (select h.hidden_at from delivery_request_hidden h where h.request_id = r.id),' || chr(10) ||
    '               ' || v_anchor);
  execute v_def;
  end if;

  -- admin_service_board: the open errands list.
  v_def := pg_get_functiondef('public.admin_service_board'::regproc);
  if position('customerHiddenAt' in v_def) = 0 then
  v_anchor := '''waitingMinutes'', floor(extract(epoch from (now() - r.created_at)) / 60)::int,';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'M228: admin_service_board anchor not found exactly once';
  end if;
  v_def := replace(v_def, v_anchor,
    '''customerHiddenAt'', (select h.hidden_at from delivery_request_hidden h where h.request_id = r.id),' || chr(10) ||
    '               ' || v_anchor);
  execute v_def;
  end if;
end $$;
