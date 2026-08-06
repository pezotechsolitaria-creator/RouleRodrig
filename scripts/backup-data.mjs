// Data backup without Docker or pg_dump.
//
// `supabase db dump` shells out to pg_dump inside a Docker container, and
// Docker is a heavy dependency to carry for a database this small. The SCHEMA
// is already backed up better than pg_dump could manage — it is the 100
// migrations in supabase/migrations/, committed and pushed to GitHub, complete
// with the reasoning behind each one. Only the DATA needed a home.
//
// This connects directly with `pg` and writes every public table to a single
// JSON file. JSON rather than SQL INSERTs on purpose: it survives schema
// changes (a restore can map fields), it is diffable, and it cannot be
// half-executed against a live database by accident.
//
// Usage:
//   $env:DBURL = "postgresql://..."      (PowerShell)
//   node scripts/backup-data.mjs
//
// The output contains REAL CUSTOMER DATA — names, emails, phone numbers.
// Keep it out of the repo. .gitignore covers rr-backup-*.json.

import { writeFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DBURL;
if (!url) {
  console.error("DBURL is not set. In PowerShell:\n  $env:DBURL = \"postgresql://...\"");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

// Ordered parent-first so a future restore can insert without deferring FKs.
const TABLES = [
  "site_content", "site_content_history",
  "bookings", "place_bookings", "taxi_drivers", "partners",
  "owner_applications", "lead_events", "contact_submissions",
  "merchants", "merchant_staff", "merchant_subscriptions", "subscription_invoices",
  "stores", "store_payment_settings", "store_hours",
  "categories", "products", "product_variants", "product_media",
  "orders", "order_items", "payments", "inventory_movements",
  "notifications", "reviews", "qr_pickup_tokens",
  "delivery_zones", "marketplace_settings", "marketplace_listings",
];

const out = { takenAt: new Date().toISOString(), tables: {} };
let total = 0;

await client.connect();

for (const t of TABLES) {
  try {
    const { rows } = await client.query(`select * from public.${t}`);
    out.tables[t] = rows;
    total += rows.length;
    if (rows.length) console.log(`  ${t.padEnd(24)} ${rows.length}`);
  } catch (e) {
    // A table that does not exist is not a failure — the list is deliberately
    // generous so it keeps working as the schema grows. Record it and move on
    // rather than aborting a backup 80% of the way through.
    out.tables[t] = { skipped: e.message };
    console.log(`  ${t.padEnd(24)} skipped (${e.message.split("\n")[0]})`);
  }
}

await client.end();

const stamp = out.takenAt.slice(0, 19).replace(/[:T]/g, "-");
const file = `rr-backup-${stamp}.json`;
writeFileSync(file, JSON.stringify(out, null, 2), "utf8");

console.log(`\n${total} rows across ${Object.keys(out.tables).length} tables -> ${file}`);
console.log("MOVE THIS FILE OUT OF THE PROJECT FOLDER — it contains real customer data.");
