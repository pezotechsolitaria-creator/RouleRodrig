import { describe, it, expect, vi, beforeEach } from "vitest";

// The router is the boundary under test here, not the transport: these tests
// assert WHAT gets handed to sendTransactionalEmail, because everything past
// that point (routing, quota, retries) is already covered by lib/email tests.
const send = vi.fn(async () => ({ ok: true }) as { ok: boolean });
vi.mock("@/lib/email/send", () => ({ sendTransactionalEmail: (i: unknown) => send(i as never) }));
vi.mock("server-only", () => ({}));

const { notifyApplicationDecision } = await import("./partner-application");

const base = {
  id: "11111111-1111-1111-1111-111111111111",
  owner_name: "Jean Marie Prosper",
  email: "jean@example.com",
  listing_type: "vehicle",
  business_name: null as string | null,
};

beforeEach(() => send.mockClear());

describe("partner application decision email", () => {
  it("sends nothing when the applicant gave no email", async () => {
    // Phone is the only REQUIRED contact field on the form, so a decision on a
    // phone-only application must be a quiet no-op rather than an error.
    const ok = await notifyApplicationDecision({ ...base, email: null }, "approved");
    expect(ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("is idempotent per application AND per outcome", async () => {
    await notifyApplicationDecision(base, "approved");
    const approved = send.mock.calls[0][0] as { idempotencyKey: string };
    send.mockClear();
    await notifyApplicationDecision(base, "rejected");
    const rejected = send.mock.calls[0][0] as { idempotencyKey: string };

    // Same application, different decision → different key, or reversing a
    // decision would be swallowed as a duplicate of the first one.
    expect(approved.idempotencyKey).toContain(base.id);
    expect(approved.idempotencyKey).not.toBe(rejected.idempotencyKey);
  });

  it("tells an approved taxi driver that WE will add them", async () => {
    // The M47 categories cannot self-serve. Copy that says "log in and finish
    // setup" would be a lie for these three, so the approval text must promise
    // an action by us.
    await notifyApplicationDecision({ ...base, listing_type: "taxi" }, "approved");
    const { html } = send.mock.calls[0][0] as { html: string };
    expect(html).toMatch(/Taxi page/);
    expect(html).not.toMatch(/vehicle/);
  });

  it("tells an approved organiser to expect an invite at that address", async () => {
    await notifyApplicationDecision({ ...base, listing_type: "event" }, "approved");
    const { html } = send.mock.calls[0][0] as { html: string };
    expect(html).toMatch(/organiser account/);
    expect(html).toMatch(/invite/);
  });

  it("never invents a reason for a rejection", async () => {
    const { html } = await notifyApplicationDecision(base, "rejected").then(
      () => send.mock.calls[0][0] as { html: string },
    );
    // A template cannot know why the owner declined, so it must not imply one.
    expect(html).not.toMatch(/because|due to|unfortunately your/i);
    expect(html).toMatch(/get in touch/i);
  });

  it("escapes the applicant's own name into the HTML", async () => {
    // owner_name is free text straight from a public form.
    await notifyApplicationDecision(
      { ...base, owner_name: "<script>alert(1)</script>" },
      "approved",
    );
    const { html } = send.mock.calls[0][0] as { html: string };
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("routes as the declared email type", async () => {
    await notifyApplicationDecision(base, "approved");
    const call = send.mock.calls[0][0] as { type: string; relatedType: string };
    expect(call.type).toBe("partner_application_decision");
    expect(call.relatedType).toBe("owner_application");
  });
});
