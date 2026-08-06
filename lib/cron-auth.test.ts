import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeCron } from "./cron-auth";

// Minimal stand-in for NextRequest — authorizeCron only reads one header.
const req = (authorization?: string) => ({
  headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? (authorization ?? null) : null) },
});

const ORIGINAL = process.env.CRON_SECRET;
beforeEach(() => {
  delete process.env.CRON_SECRET;
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL;
});

describe("authorizeCron", () => {
  // The regression this file exists for. The previous guard was
  //   if (secret && header !== `Bearer ${secret}`) → 401
  // so with CRON_SECRET unset, /api/cron/reminders — scheduled publicly in
  // vercel.json — accepted anonymous GETs that email customers, WhatsApp the
  // owner customer names and phone numbers, and cancel pending bookings.
  it("fails CLOSED when CRON_SECRET is unset, even with no credentials", () => {
    const r = authorizeCron(req());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(503);
  });

  it("fails closed when CRON_SECRET is unset even if the caller invents a token", () => {
    const r = authorizeCron(req("Bearer anything"));
    expect(r.ok).toBe(false);
  });

  it("treats a whitespace-only CRON_SECRET as unset", () => {
    process.env.CRON_SECRET = "   ";
    const r = authorizeCron(req("Bearer    "));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(503);
  });

  it("distinguishes misconfiguration (503) from a rejected caller (401)", () => {
    process.env.CRON_SECRET = "s3cret";
    const rejected = authorizeCron(req("Bearer wrong"));
    expect(rejected.ok).toBe(false);
    if (rejected.ok) return;
    expect(rejected.status).toBe(401);
  });

  it("accepts the correct bearer token", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req("Bearer s3cret")).ok).toBe(true);
  });

  it("rejects a missing header, the bare secret, and a prefix of the secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req()).ok).toBe(false);
    expect(authorizeCron(req("s3cret")).ok).toBe(false);
    expect(authorizeCron(req("Bearer s3cre")).ok).toBe(false);
    expect(authorizeCron(req("Bearer s3cret ")).ok).toBe(false);
  });

  it("is not fooled by case or a duplicated scheme", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(authorizeCron(req("bearer s3cret")).ok).toBe(false);
    expect(authorizeCron(req("Bearer Bearer s3cret")).ok).toBe(false);
  });
});
