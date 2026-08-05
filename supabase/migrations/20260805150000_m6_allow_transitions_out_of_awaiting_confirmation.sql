-- Deadlock fix. submit_payment_receipt() moves an order to
-- awaiting_payment_confirmation and nulls auto_release_at (correctly - an order
-- backed by real money must never be swept by the abandoned-checkout reaper).
-- But update_order_status() had no legal transition OUT of that state, so a
-- customer who uploaded the wrong or a fraudulent receipt left the order stuck
-- forever: the merchant could not reject it, and its stock stayed reserved with
-- nothing able to release it.
--
-- Rewrites only the legality expression; the guard makes a silent no-op
-- impossible. The existing stock-release branch already fires for any move to
-- 'cancelled' from a non-cancelled state, so rejecting now returns the stock.
do $do$
declare
  src text; newsrc text;
  old_rule text := '    (v_current_status = ''pending_payment'' and p_new_status in (''paid'', ''cancelled'')) or';
  new_rule text := '    (v_current_status = ''pending_payment'' and p_new_status in (''paid'', ''cancelled'')) or
    (v_current_status = ''awaiting_payment_confirmation'' and p_new_status in (''paid'', ''cancelled'')) or';
begin
  select pg_get_functiondef(oid) into src from pg_proc where proname = 'update_order_status';
  if src is null then raise exception 'update_order_status() not found'; end if;

  if position(old_rule in src) = 0 then
    if position('awaiting_payment_confirmation'' and p_new_status' in src) > 0 then
      raise notice 'already allows transitions out of awaiting_payment_confirmation';
      return;
    end if;
    raise exception 'update_order_status() legality block did not match - refusing to patch blindly';
  end if;

  newsrc := replace(src, old_rule, new_rule);
  execute newsrc;
end
$do$;
