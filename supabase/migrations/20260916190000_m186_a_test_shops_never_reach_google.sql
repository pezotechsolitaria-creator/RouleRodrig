-- ── M186 · A SHOP NAMED "(TEST)" NEVER REACHES GOOGLE ──────────────────────
--
-- Applied to production 2026-09-16.
--
-- sitemap_stores() gated on one thing: `not coalesce(no_index, false)`. The
-- flag works, and it was MISSED TWICE. On 16 Sep 2026 the live sitemap carried
--
--   /shop/fete-rodrigues-test            "Fête Rodrigues (TEST) — Rodrigues…"
--   /shop/rodrigues-repairs-test         "Rodrigues Repairs (TEST) — Rodrigues…"
--
-- plus four of their product pages: six URLs submitted to Google with the word
-- TEST in the title a searcher would read. Two OTHER test shops in the same
-- table had no_index set correctly, which is the tell — this is not a missing
-- mechanism, it is a checkbox somebody has to remember.
--
-- So the name becomes a second gate. A store whose display name contains
-- "(test)" in parentheses is a fixture by construction: that is not how anybody
-- names a shop they want customers to find, and it is the exact string that
-- would otherwise be published in the page title.
--
-- Deliberately NARROW. It matches the parenthesised form only, so a genuine
-- business with "test" inside a word — Protest Prints, Greatest Hits — is
-- untouched. The flag remains the primary control: "Roulé Test Services" has no
-- parentheses and is caught by its no_index alone, which is exactly why this is
-- a safety net rather than a replacement.
--
-- It does NOT unpublish anything. The shop still resolves, still sells, still
-- works for the pre-launch testing window it exists for. It is simply absent
-- from the sitemap, which is all this function decides.

create or replace function public.sitemap_stores()
returns table(slug text, updated_at timestamp with time zone)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
  select s.slug::text, s.updated_at
  from public.marketplace_stores s
  where not coalesce(s.no_index, false)
    -- The second gate. See the note above: the flag was missed twice.
    and coalesce(s.name, '') !~* '\(\s*test\s*\)'
  order by s.updated_at desc nulls last
  limit 5000;
$function$;

do $$
declare
  v_leaked integer;
begin
  -- Post-condition, proved rather than trusted: no sitemap row may carry a
  -- parenthesised TEST in its name.
  select count(*) into v_leaked
  from public.sitemap_stores() f
  join public.stores s on s.slug::text = f.slug
  where coalesce(s.name, '') ~* '\(\s*test\s*\)';

  if v_leaked > 0 then
    raise exception 'M186: % test-named shop(s) still reach the sitemap', v_leaked;
  end if;
end $$;
