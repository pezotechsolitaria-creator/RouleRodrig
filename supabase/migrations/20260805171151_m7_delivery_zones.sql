-- M7: delivery is priced by REGION, not a single island-wide fee.
--
-- The customer picks their zone at checkout and the server derives the fee from
-- that row — the client never supplies a price, exactly as with the old flat
-- fee. GPS is still captured separately for navigation, so a customer who
-- selects a cheap zone but drops a pin far away is visible to the merchant,
-- who can cancel.
--
-- Zone is chosen rather than inferred from GPS deliberately: Rodrigues
-- localities are small and irregularly shaped, so nearest-centroid matching
-- would mis-price boundary addresses, and a wrong automatic price is worse
-- than one extra tap. Centroid-based suggestion can be layered on later
-- without changing this schema.
create table delivery_zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- Villages/localities covered, shown under the zone name so a customer can
  -- recognise theirs without knowing the zone's marketing name.
  covers      text,
  fee         integer not null check (fee >= 0),   -- minor units, like all money here
  is_active   boolean not null default true,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index delivery_zones_active_idx on delivery_zones (is_active, position);

alter table delivery_zones enable row level security;
-- Customers must see zones and prices to choose one; only the platform writes.
create policy delivery_zones_public_read on delivery_zones for select using (true);
create policy delivery_zones_admin_write on delivery_zones for all
  using (is_platform_admin()) with check (is_platform_admin());
revoke insert, update, delete on delivery_zones from authenticated, anon;

-- Seeded with real Rodrigues localities grouped by distance from Port Mathurin,
-- every zone at the CURRENT flat fee (Rs 150) so this migration changes the
-- structure without silently changing anyone's price. The owner sets real
-- per-zone fees before launch.
insert into delivery_zones (name, covers, fee, position) values
  ('Port Mathurin & around', 'Port Mathurin, Camp du Roi, Caverne Provert', 15000, 1),
  ('North coast',            'Baie aux Huîtres, Baie du Nord, Grand Baie, Anse Ally', 15000, 2),
  ('Centre',                 'Mont Lubin, La Ferme, Citronelle, Quatre Vents', 15000, 3),
  ('East',                   'Pointe Coton, Graviers, Saint François, Roche Bon Dieu', 15000, 4),
  ('South & airport',        'Plaine Corail, Petit Gabriel, Rivière Cocos, La Fouche', 15000, 5);

-- Which zone an order was priced against. The fee itself stays snapshotted on
-- orders.delivery_fee, so re-pricing a zone later never rewrites history.
alter table orders
  add column if not exists delivery_zone_id uuid references delivery_zones(id);

-- Roulé Rodrigues does not promise a delivery time — the customer and the
-- driver agree it. This is an upper bound used for wording only, never a
-- guarantee. delivery_eta_minutes is left in place but is now unused.
alter table marketplace_settings
  add column if not exists delivery_max_minutes integer not null default 120
    check (delivery_max_minutes > 0);
