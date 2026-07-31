-- ============================================================================
-- Harden onboard_merchant(): Postgres grants EXECUTE to PUBLIC by default on
-- function creation, so the previous migration left it callable by `anon`
-- alongside `authenticated`. The function already guards on auth.uid() being
-- null before any write, so this was not exploitable — but there is no reason
-- for an unauthenticated caller to be able to invoke it at all.
-- ============================================================================
revoke execute on function onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid) from public;
revoke execute on function onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid) from anon;
grant execute on function onboard_merchant(text, text, text, text, text, text, text, integer, integer, text, uuid) to authenticated;
