-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ RLS LOCKDOWN — anon key (shipped in browser) gets least privilege.     ║
-- ║ Admin operations use the service-role key, which bypasses RLS.         ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── bookings: public may only INSERT a pending request ──
DROP POLICY IF EXISTS anon_insert_bookings ON bookings;
DROP POLICY IF EXISTS anon_select_bookings ON bookings;
DROP POLICY IF EXISTS anon_update_bookings ON bookings;
CREATE POLICY bookings_anon_insert ON bookings
  FOR INSERT TO anon WITH CHECK (status = 'pending');

-- ── contact_submissions: public may only INSERT ──
DROP POLICY IF EXISTS "Anyone can insert contact submissions" ON contact_submissions;
DROP POLICY IF EXISTS "Anyone can read contact submissions" ON contact_submissions;
DROP POLICY IF EXISTS anon_delete_contact_submissions ON contact_submissions;
CREATE POLICY contact_anon_insert ON contact_submissions
  FOR INSERT TO anon WITH CHECK (true);

-- ── marketplace_listings: public may only READ active listings ──
DROP POLICY IF EXISTS anon_delete_listings ON marketplace_listings;
DROP POLICY IF EXISTS anon_insert_listings ON marketplace_listings;
DROP POLICY IF EXISTS anon_select_listings ON marketplace_listings;
DROP POLICY IF EXISTS anon_update_listings ON marketplace_listings;
CREATE POLICY listings_anon_select_active ON marketplace_listings
  FOR SELECT TO anon USING (active = true);

-- ── partners: NO public access at all (admin/service-role only) ──
DROP POLICY IF EXISTS anon_delete_partners ON partners;
DROP POLICY IF EXISTS anon_insert_partners ON partners;
DROP POLICY IF EXISTS anon_select_partners ON partners;
DROP POLICY IF EXISTS anon_update_partners ON partners;

-- ── product_reviews: public may INSERT pending + READ approved ──
DROP POLICY IF EXISTS reviews_public_delete ON product_reviews;
DROP POLICY IF EXISTS reviews_anon_insert ON product_reviews;
DROP POLICY IF EXISTS reviews_public_select ON product_reviews;
DROP POLICY IF EXISTS reviews_public_update ON product_reviews;
CREATE POLICY reviews_anon_insert ON product_reviews
  FOR INSERT TO anon WITH CHECK (status = 'pending');
CREATE POLICY reviews_anon_select_approved ON product_reviews
  FOR SELECT TO anon USING (status = 'approved');

-- ── site_content: public READ only (admin saves via service role) ──
DROP POLICY IF EXISTS sc_anon_insert ON site_content;
DROP POLICY IF EXISTS sc_public_select ON site_content;
DROP POLICY IF EXISTS sc_public_update ON site_content;
CREATE POLICY sc_anon_select ON site_content
  FOR SELECT TO anon USING (true);

-- ── taxi_drivers: public READ active only ──
DROP POLICY IF EXISTS "service role full access taxi drivers" ON taxi_drivers;
DROP POLICY IF EXISTS "public read active taxi drivers" ON taxi_drivers;
CREATE POLICY taxi_anon_select_active ON taxi_drivers
  FOR SELECT TO anon USING (active = true);

-- ── waitlist: public may only INSERT ──
DROP POLICY IF EXISTS waitlist_anon_insert ON waitlist;
DROP POLICY IF EXISTS waitlist_public_select ON waitlist;
DROP POLICY IF EXISTS waitlist_public_delete ON waitlist;
CREATE POLICY waitlist_anon_insert ON waitlist
  FOR INSERT TO anon WITH CHECK (true);

-- ── taxi_driver_reviews: public INSERT pending + READ approved ──
DROP POLICY IF EXISTS tdr_anon_insert ON taxi_driver_reviews;
DROP POLICY IF EXISTS tdr_public_select ON taxi_driver_reviews;
DROP POLICY IF EXISTS tdr_public_update ON taxi_driver_reviews;
DROP POLICY IF EXISTS tdr_public_delete ON taxi_driver_reviews;
CREATE POLICY tdr_anon_insert ON taxi_driver_reviews
  FOR INSERT TO anon WITH CHECK (status = 'pending');
CREATE POLICY tdr_anon_select_approved ON taxi_driver_reviews
  FOR SELECT TO anon USING (status = 'approved');