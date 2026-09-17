-- ═══════════════════════════════════════════════════════════════════════════
-- M205 — RECORDING THAT IT WENT OUT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- M204 added the columns. This is the only way to write them.
--
-- send_count = send_count + 1 is an expression, and PostgREST cannot send an
-- expression — an application would have to read the count, add one and write
-- it back, which is a lost update the moment two people press Send at the same
-- moment. It is one statement in SQL, so it is one statement in SQL.
--
-- It is also the reason the columns are not simply left to the application:
-- invoices_sent_consistent requires sent_at and send_count to agree, and one
-- function that sets both together can never violate it.
--
-- WHAT IT DOES NOT DO: send anything, or judge whether sending was a good
-- idea. The application owns the providers, the quotas and the failover. By
-- the time this is called the mail has already been accepted — this records a
-- fact about the past, which is why it cannot fail on state: a document can be
-- resent after it is paid, and a cancelled one can be sent for the record.

create or replace function public.invoice_mark_sent(
  p_invoice_id uuid,
  p_to         text
)
returns public.invoices
language plpgsql
volatile
security definer
set search_path = 'public, pg_temp'
as $fn$
declare
  v_inv public.invoices;
begin
  if nullif(btrim(coalesce(p_to, '')), '') is null then
    raise exception 'invoice_mark_sent: an address is required' using errcode = 'RRINV';
  end if;

  update public.invoices
     set sent_at    = now(),
         sent_to    = btrim(p_to),
         send_count = send_count + 1,
         updated_at = now()
   where id = p_invoice_id
   returning * into v_inv;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id using errcode = 'RRINV';
  end if;

  return v_inv;
end;
$fn$;

-- Supabase grants EXECUTE on new public functions to anon and authenticated by
-- default, and REVOKE FROM PUBLIC does not remove a named-role grant. Both
-- roles are revoked explicitly, and the assertion below is what proves it.
revoke all on function public.invoice_mark_sent(uuid, text) from public;
revoke all on function public.invoice_mark_sent(uuid, text) from anon;
revoke all on function public.invoice_mark_sent(uuid, text) from authenticated;
grant execute on function public.invoice_mark_sent(uuid, text) to service_role;

do $assert$
begin
  if has_function_privilege('anon','public.invoice_mark_sent(uuid,text)','EXECUTE') then
    raise exception 'anon can mark invoices sent';
  end if;
  if has_function_privilege('authenticated','public.invoice_mark_sent(uuid,text)','EXECUTE') then
    raise exception 'authenticated can mark invoices sent';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
