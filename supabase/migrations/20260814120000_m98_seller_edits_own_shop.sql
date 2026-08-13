-- ── M98 — a seller can edit their own shop ────────────────────────────────
--
-- The owner: "Why so? They have their own dashboard."
--
-- Correct, and there is no good answer. The dashboard is real and covers a lot:
-- `authenticated` holds full CRUD on products, product_variants and
-- product_media, and INSERT/UPDATE/DELETE on store_payment_settings. A merchant
-- already runs their own catalogue, prices, stock, photos, orders and bank
-- details.
--
-- The one thing they could not touch is the shop ITSELF. `stores` grants
-- authenticated SELECT and nothing more, so name, tagline, description,
-- address, map pin, phone and logo had only ever been editable by the platform
-- owner. That was never a decision about merchants — it is the M8 grant doing
-- its job on the DANGEROUS columns and taking the harmless ones with it,
-- because a table grant cannot tell `name` from `merchant_id`. There is even an
-- RLS policy for it, stores_staff_write, which has never once run: grants are
-- checked before row security. A gap, not a policy.
--
-- Same narrow door as M97, widened to the presentation fields, with an explicit
-- whitelist rather than a patch object that trusts its caller.
--
-- NOT EDITABLE, and why each one:
--   status        — visibility and approval. The platform's call.
--   slug          — every existing link and the sitemap point at it.
--   is_test       — hides the shop everywhere; a footgun with no upside.
--   no_index      — SEO; a shop cannot judge its own indexing.
--   featured / featured_until — paid or editorial placement.
--   merchant_id   — ownership. Writable means a shop can be stolen.
--   currency, tax_inclusive, default_tax_rate — money maths, set once.
--   rating_avg / rating_count — computed from real reviews.
--
-- Anything absent from the whitelist is IGNORED rather than rejected, so a
-- column added later cannot become writable by accident, and an older client
-- sending an unknown field still saves the rest.
--
-- Verified as a real merchant, sending the dangerous fields in the same patch
-- as the harmless ones: name and tagline saved, lat 999 clamped to 90, and
-- status, is_test, featured, slug and merchant_id all left untouched.
create or replace function public.set_store_profile(p_store_id uuid, p_patch jsonb)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare v_text text;
begin
  if p_store_id is null or not (is_store_staff(p_store_id) or is_platform_admin()) then
    raise exception using errcode = 'RR003', message = 'Shop not found.';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = 'RR005', message = 'Nothing to save.';
  end if;

  -- A shop must keep a name. Empty-string-to-null everywhere else.
  if p_patch ? 'name' then
    v_text := btrim(coalesce(p_patch ->> 'name', ''));
    if v_text = '' then
      raise exception using errcode = 'RR005', message = 'Your shop needs a name.';
    end if;
    update stores set name = left(v_text, 200) where id = p_store_id;
  end if;

  if p_patch ? 'tagline' then
    update stores set tagline = left(nullif(btrim(coalesce(p_patch ->> 'tagline','')), ''), 200)
     where id = p_store_id; end if;
  if p_patch ? 'description' then
    update stores set description = left(nullif(btrim(coalesce(p_patch ->> 'description','')), ''), 2000)
     where id = p_store_id; end if;
  if p_patch ? 'address' then
    update stores set address = left(nullif(btrim(coalesce(p_patch ->> 'address','')), ''), 300)
     where id = p_store_id; end if;
  if p_patch ? 'phone' then
    update stores set phone = left(nullif(btrim(coalesce(p_patch ->> 'phone','')), ''), 40)
     where id = p_store_id; end if;
  if p_patch ? 'whatsapp' then
    update stores set whatsapp = left(nullif(btrim(coalesce(p_patch ->> 'whatsapp','')), ''), 40)
     where id = p_store_id; end if;
  if p_patch ? 'logo_url' then
    update stores set logo_url = nullif(btrim(coalesce(p_patch ->> 'logo_url','')), '')
     where id = p_store_id; end if;
  if p_patch ? 'cover_url' then
    update stores set cover_url = nullif(btrim(coalesce(p_patch ->> 'cover_url','')), '')
     where id = p_store_id; end if;

  -- The map pin. Range-checked here because a bad number puts the shop in the
  -- sea and the delivery driver with it.
  if p_patch ? 'lat' then
    update stores set lat = case
      when p_patch ->> 'lat' is null or btrim(p_patch ->> 'lat') = '' then null
      else least(90, greatest(-90, (p_patch ->> 'lat')::double precision)) end
     where id = p_store_id; end if;
  if p_patch ? 'lng' then
    update stores set lng = case
      when p_patch ->> 'lng' is null or btrim(p_patch ->> 'lng') = '' then null
      else least(180, greatest(-180, (p_patch ->> 'lng')::double precision)) end
     where id = p_store_id; end if;
end;
$function$;

revoke all on function public.set_store_profile(uuid, jsonb) from public;
grant execute on function public.set_store_profile(uuid, jsonb) to authenticated, service_role;
