-- ── A `create or replace` that did not replace ─────────────────────────────
--
-- Adding `p_errand_kind text default null` changed the SIGNATURE, so Postgres
-- created a SECOND function rather than replacing the first. The database was
-- left holding two create_delivery_request overloads, 20 args and 21.
--
-- That is not cosmetic. PostgREST picks an overload from the argument names in
-- the JSON body, and when a call is ambiguous it refuses the whole request with
-- PGRST203 "could not choose the best candidate function" — so the endpoint
-- fails for everybody, not just for errands. And the stale copy knows nothing
-- about errand_kind: anything reaching it would try to write an errand with no
-- type, which only the table CHECK would then catch, as a 23514 rather than as
-- the sentence a person can act on.
--
-- Dropped by exact signature, never by name, so this cannot take the live one
-- with it.
drop function if exists public.create_delivery_request(
  text, text, text, text, text, text, text, integer, text, text,
  double precision, double precision, double precision, double precision,
  text, text, text, text, text, date
);
