#!/usr/bin/env node
// ── RE-ENCODE WHAT IS ALREADY IN THE BUCKET ─────────────────────────────────
//
// The upload routes resize from now on. This is the other half: 393 objects
// averaging 612 kB were stored before that existed, and they are what the live
// site serves today. Forty-eight raw <img> tags across the public pages hand
// those originals straight to a browser at full size.
//
// Re-encoding IN PLACE — same bucket, same object name — fixes all of them at
// once without touching a single component, because every URL already in a
// database row, a content blob or a page keeps working.
//
// WHAT IT IS ACTUALLY WORTH, measured on a ten-decile sample of the real
// bucket rather than guessed from the biggest files: about 54%. Most objects
// in here are already web-sized and shrink 10-30%; the handful of untouched
// camera photos shrink 90%+. New uploads see the bigger number, because a
// phone photo is what the resize was built for.
//
// SAFE BY DEFAULT: this reports and changes nothing unless --write is passed.
// With --write it overwrites the original, which cannot be undone, so it also
// refuses to make any file bigger and skips anything already small.
//
// It skips what it cannot read, and one object needs that: a 4 MB .heic in
// `uploads` has a corrupt header. Nothing references it — not site_content,
// product_media, stores or taxi_drivers — so it is dead weight from a failed
// upload rather than a broken image on a page.
//
//   node --use-system-ca scripts/shrink-stored-images.mjs           # dry run
//   node --use-system-ca scripts/shrink-stored-images.mjs --write   # do it
//
// The extension is deliberately left alone. A .jpg holding WebP bytes is
// served correctly because browsers read Content-Type, not the name — and
// renaming would break every URL already stored, which is the one thing this
// script exists to avoid.

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { readFileSync } from "node:fs";

const MAX_EDGE = 1600;
const QUALITY = 80;
const BUCKETS = ["uploads", "merchant-media"];
const WRITE = process.argv.includes("--write");

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const fmt = (n) => (n / 1048576).toFixed(1) + " MB";

async function listAll(bucket, prefix = "") {
  const out = [];
  for (let page = 0; ; page++) {
    const { data, error } = await db.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset: page * 100 });
    if (error) throw error;
    if (!data?.length) break;
    for (const o of data) {
      const path = prefix ? `${prefix}/${o.name}` : o.name;
      // A folder comes back with no id; recurse into it (merchant-media is
      // namespaced by store id, so everything real is one level down).
      if (!o.id) out.push(...(await listAll(bucket, path)));
      else out.push({ path, size: Number(o.metadata?.size ?? 0), mime: o.metadata?.mimetype ?? "" });
    }
    if (data.length < 100) break;
  }
  return out;
}

let before = 0, after = 0, changed = 0, skipped = 0, failed = 0;

for (const bucket of BUCKETS) {
  const objects = await listAll(bucket);
  const images = objects.filter((o) => /^image\//.test(o.mime));
  console.log(`\n=== ${bucket}: ${images.length} images, ${fmt(images.reduce((n, o) => n + o.size, 0))} ===`);

  for (const obj of images) {
    const { data, error } = await db.storage.from(bucket).download(obj.path);
    if (error) { console.log(`  ! ${obj.path}: ${error.message}`); failed++; continue; }
    const original = Buffer.from(await data.arrayBuffer());

    let encoded;
    try {
      encoded = await sharp(original, { failOn: "none" })
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toBuffer();
    } catch (err) {
      console.log(`  ! ${obj.path}: unreadable (${err.message})`);
      failed++;
      continue;
    }

    before += original.byteLength;
    // Never make a file bigger, and do not churn a file for a rounding error.
    if (encoded.byteLength >= original.byteLength * 0.95) {
      after += original.byteLength;
      skipped++;
      continue;
    }
    after += encoded.byteLength;
    changed++;
    const pct = (100 - (100 * encoded.byteLength) / original.byteLength).toFixed(0);
    console.log(
      `  ${WRITE ? "shrunk" : "would shrink"} ${obj.path}: ` +
        `${(original.byteLength / 1024).toFixed(0)} kB -> ${(encoded.byteLength / 1024).toFixed(0)} kB (${pct}% off)`,
    );

    if (WRITE) {
      const { error: upErr } = await db.storage
        .from(bucket)
        .upload(obj.path, encoded, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: true,
        });
      if (upErr) { console.log(`  ! write failed ${obj.path}: ${upErr.message}`); failed++; }
    }
  }
}

console.log(`\n${WRITE ? "WROTE" : "DRY RUN — nothing was changed"}`);
console.log(`  images read:    ${changed + skipped}`);
console.log(`  would shrink:   ${changed}`);
console.log(`  left alone:     ${skipped} (already small enough)`);
console.log(`  unreadable:     ${failed}`);
console.log(`  total before:   ${fmt(before)}`);
console.log(`  total after:    ${fmt(after)}`);
console.log(`  saving:         ${fmt(before - after)}  (${(100 - (100 * after) / before).toFixed(0)}%)`);
if (!WRITE) console.log(`\nRe-run with --write to apply. This overwrites the originals.`);
