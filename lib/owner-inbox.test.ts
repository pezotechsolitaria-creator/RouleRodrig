import { describe, expect, it, beforeAll, beforeEach, afterEach } from "vitest";
import { CONTACT_EMAIL } from "./site";

// ── The regression this exists to prevent ──────────────────────────────────
//
// Seven internal emails read process.env.OWNER_EMAIL and returned false when it
// was unset. On 2026-08-13 the owner checked Vercel and it had never been set
// there — so every one of them had silently done nothing for months. He had
// never received a "new booking" email and had no way to discover that.
//
// The rule now: owner alerts always have somewhere to go. A future change that
// reintroduces "no address means send nothing" fails here.

const ORIGINAL = process.env.OWNER_EMAIL;

// lib/email pulls in the whole provider graph. Imported ONCE here rather than
// inside each test: paid per-test it exceeded vitest's 5s default on the first
// one and failed while the other four passed — the same false alarm that has
// bitten two other files in this suite. The functions read process.env at CALL
// time, so one import serves every case below.
let mod: typeof import("./email");
beforeAll(async () => { mod = await import("./email"); }, 30_000);

describe("ownerInbox", () => {
  beforeEach(() => { delete process.env.OWNER_EMAIL; });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = ORIGINAL;
  });

  it("never returns empty — an unset variable must not silence every alert", async () => {
    const { ownerInbox } = mod;
    expect(await ownerInbox()).toBeTruthy();
    expect(await ownerInbox()).toContain("@");
  });

  it("falls back to the site's published contact address", async () => {
    // With no OWNER_EMAIL and no reachable config (no service role in tests),
    // the last resort still answers. That fallback is what keeps an alert from
    // being addressed to nothing.
    const { ownerInbox } = mod;
    expect(await ownerInbox()).toBe(CONTACT_EMAIL);
  });

  it("prefers OWNER_EMAIL when it is set — a personal inbox is read faster", async () => {
    process.env.OWNER_EMAIL = "owner@example.com";
    const { ownerInbox } = mod;
    expect(await ownerInbox()).toBe("owner@example.com");
  });

  it("treats whitespace as unset rather than mailing to a blank address", async () => {
    process.env.OWNER_EMAIL = "   ";
    const { ownerInbox } = mod;
    expect(await ownerInbox()).toBe(CONTACT_EMAIL);
  });

  it("reports whether the address was chosen, so /admin can say which", async () => {
    const { ownerInboxIsExplicit } = mod;
    expect(await ownerInboxIsExplicit()).toBe(false);
    process.env.OWNER_EMAIL = "owner@example.com";
    expect(await ownerInboxIsExplicit()).toBe(true);
  });
});
