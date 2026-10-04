import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_ALERT, EMAIL_COPY, HUB_COPY, NOTIFY } from "./copy";

// ── The promises the spec makes, checked where they could break ─────────────
//
// Source-level on purpose: each guards a STRUCTURAL failure (a template the
// database writes that nothing can render, a phone number on a public
// response, "Book now" on a request) that a type checker cannot see and a
// database is not needed to find.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIGRATIONS = [
  "supabase/migrations/20261004185459_m240b_reservation_engine_functions.sql",
  "supabase/migrations/20261004185713_m240c_reservation_reminders.sql",
].map(read).join("\n");

function templates(audience: "guest" | "admin"): string[] {
  const re = new RegExp(`rsv_notify_${audience}\\([a-z_]+, '([a-z_]+)'`, "g");
  return [...new Set([...MIGRATIONS.matchAll(re)].map((m) => m[1]))].sort();
}

describe("every message the database queues can be written", () => {
  it("found the templates (the regex still matches the SQL)", () => {
    expect(templates("guest").length).toBeGreaterThanOrEqual(8);
    expect(templates("admin").length).toBeGreaterThanOrEqual(3);
  });

  for (const lang of ["en", "fr", "cr"] as const) {
    it(`guest templates have a sentence and a subject in ${lang}`, () => {
      for (const t of templates("guest")) {
        expect(NOTIFY[lang][t], `${lang} NOTIFY.${t}`).toBeTypeOf("function");
        expect(EMAIL_COPY[lang].subject[t], `${lang} subject.${t}`).toBeTruthy();
      }
    });
  }

  it("owner alerts have a line", () => {
    for (const t of templates("admin")) expect(ADMIN_ALERT[t], t).toBeTypeOf("function");
  });
});

describe("the guest's page never carries what isn't theirs to see", () => {
  const view = MIGRATIONS.slice(MIGRATIONS.indexOf("function public.rsv_guest_view"), MIGRATIONS.indexOf("function public.rsv_by_token"));

  it("rsv_guest_view returns no phone, no email, no owner notes, no token material", () => {
    expect(view.length).toBeGreaterThan(200);
    for (const col of ["customer_phone", "customer_email", "admin_notes", "access_token_hash", "idempotency_key"]) {
      expect(view, col).not.toContain(col);
    }
  });

  it("the admin detail strips the token hash and the key before it leaves the server", () => {
    const admin = read("lib/reservations/admin.ts");
    expect(admin).toContain("delete row.access_token_hash");
    expect(admin).toContain("delete row.idempotency_key");
  });

  it("the booking page is not indexed and sends no Referer", () => {
    const page = read("app/booking/[token]/page.tsx");
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(page).toContain('referrer: "no-referrer"');
  });
});

describe("a request is called a request", () => {
  it("the engine's button never says 'Book now'", () => {
    const modal = read("components/PlaceBookingModal.tsx");
    const block = modal.slice(modal.indexOf("const ENGINE_COPY"), modal.indexOf("} as const;", modal.indexOf("const ENGINE_COPY")));
    expect(block).toContain('cta: "Request to book"');
    expect(block).not.toMatch(/book now/i);
  });

  it("the hub never tells a guest they have paid because they said so", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(HUB_COPY[lang].reported.toLowerCase()).not.toMatch(/\bpaid\b|payée|\bpey\b\./);
    }
  });
});

describe("the price comes from the listing, not the browser", () => {
  it("POST /api/reservations takes no amount", () => {
    const server = read("lib/reservations/server.ts");
    const schema = server.slice(server.indexOf("export const createSchema"), server.indexOf("export type CreateInput"));
    expect(schema).not.toMatch(/amount|price|total/i);
  });

  it("the modal sends no amount to the engine", () => {
    const modal = read("components/PlaceBookingModal.tsx");
    const fn = modal.slice(modal.indexOf("async function submitEngine"), modal.indexOf("async function submit("));
    const call = fn.slice(fn.indexOf("body: JSON.stringify("), fn.indexOf("posthog.capture"));
    expect(call).toContain("product_id");
    expect(call).not.toMatch(/amount|price|total_/i);
  });
});
