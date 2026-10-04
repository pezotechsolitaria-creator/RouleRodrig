import { describe, it, expect, vi, beforeAll } from "vitest";
import { NextRequest } from "next/server";

// ── An editor code is a password (architecture review 2026-09-30, item 4) ───
//
// The Worlds sign-in had no limit, so a code could be guessed as fast as the
// network allowed. It now has the admin login's budget: 5 attempts per 5
// minutes per IP. Driven through the real handler and the real limiter; only
// the code list is faked, so no WORLD_EDITORS secret is needed.

vi.mock("@/lib/world-docs/access", () => ({
  EDITOR_COOKIE: "rr_world",
  EDITOR_TTL_MS: 14 * 24 * 3_600_000,
  editorSessionFor: (code: string) =>
    code === "right-code" ? { value: "signed", entry: { name: "Marie", code, worlds: ["curated"] } } : null,
}));

beforeAll(() => {
  // In-memory limiter only: never reach out to Upstash from a unit test.
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

const attempt = async (ip: string, body: unknown) => {
  const { POST } = await import("./route");
  return POST(
    new NextRequest("http://localhost/api/admin/worlds/signin", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    }),
  );
};

describe("POST /api/admin/worlds/signin", () => {
  it("still signs in with a right code", async () => {
    const res = await attempt("203.0.113.1", { code: "right-code" });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("rr_world=signed");
  });

  it("stops a sixth guess inside five minutes — even when that guess is right", async () => {
    const ip = "203.0.113.2";
    for (let i = 0; i < 5; i++) {
      expect((await attempt(ip, { code: `guess-${i}` })).status, `attempt ${i + 1}`).toBe(401);
    }
    const sixth = await attempt(ip, { code: "right-code" });
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("set-cookie")).toBeNull();
  });

  it("counts an attempt before reading the body, so garbage cannot probe for free", async () => {
    const ip = "203.0.113.3";
    for (let i = 0; i < 5; i++) expect((await attempt(ip, "not json")).status).toBe(400);
    expect((await attempt(ip, { code: "right-code" })).status).toBe(429);
  });

  it("is per IP: one address's guesses do not lock out another", async () => {
    for (let i = 0; i < 6; i++) await attempt("203.0.113.4", { code: "nope" });
    expect((await attempt("203.0.113.5", { code: "right-code" })).status).toBe(200);
  });
});
