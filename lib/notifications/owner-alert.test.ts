import { describe, it, expect } from "vitest";
import {
  ownerAlert,
  encodedLength,
  localDial,
  chatLink,
  alertMoneyCents,
  alertMoneyRupees,
  absoluteUrl,
  ALERT_LIMITS,
} from "./owner-alert";

// ── THE ALERT HAS TO ARRIVE, AND IT HAS TO SAY SOMETHING ────────────────────
//
// Two failure modes, both of which have happened here. An alert can say so
// little the owner cannot act on it ("1 closed, 1 prices withdrawn"), or it can
// say so much it never leaves the process — CallMeBot carries the message in a
// URL, so length is a delivery problem, not a formatting one.

describe("the first line stands alone", () => {
  it("is the ntfy title and the email subject, so it is never a bare label", () => {
    const m = ownerAlert({
      headline: "Rs 250 delivery expired with 3 prices waiting",
      facts: [{ label: "Item", value: "Glass" }],
    });
    expect(m.split("\n")[0]).toBe("Rs 250 delivery expired with 3 prices waiting");
  });

  it("survives ntfy's ASCII-only Title header with something left", () => {
    // ntfy strips the title to latin-1-safe ASCII and cuts at 120. A headline
    // that is mostly emoji arrives as an empty title.
    const m = ownerAlert({ headline: "Taxi booked — Rivière Cocos to Port Mathurin" });
    const asciiTitle = m.split("\n")[0].replace(/[^\x20-\x7E]/g, "").trim();
    expect(asciiTitle.length).toBeGreaterThan(20);
    expect(asciiTitle).toContain("Taxi booked");
  });
});

describe("facts, not counts", () => {
  it("drops a fact with no value rather than printing an empty label", () => {
    const m = ownerAlert({
      headline: "New taxi booking",
      facts: [
        { label: "Who", value: "Laurence" },
        { label: "Phone", value: null },
        { label: "Note", value: "   " },
        { label: "When", value: "10 Sept 10:00" },
      ],
    });
    expect(m).toContain("Who: Laurence");
    expect(m).toContain("When: 10 Sept 10:00");
    expect(m).not.toContain("Phone:");
    expect(m).not.toContain("Note:");
  });

  it("accepts a number without the caller stringifying it", () => {
    const m = ownerAlert({ headline: "x", facts: [{ label: "Prices", value: 3 }] });
    expect(m).toContain("Prices: 3");
  });
});

describe("the tap is never the thing that gets cut", () => {
  it("keeps the link when the facts overflow, and says how many were dropped", () => {
    const facts = Array.from({ length: 40 }, (_, i) => ({
      label: `Job ${i + 1}`,
      value: "Baie aux Huîtres to Rivière Banane, Rs 300, waiting 5 h",
    }));
    const m = ownerAlert({
      headline: "40 jobs need you",
      facts,
      note: "Nobody has been assigned.",
      actions: [{ kind: "open", label: "Open", path: "/admin/deliveries" }],
    });
    expect(m).toContain("Open: https://");
    expect(m).toContain("Nobody has been assigned.");
    // Silent truncation would read as an alert about three jobs.
    // ASCII dots on purpose: an ellipsis costs 9 bytes once encoded, three do 3.
    expect(m).toMatch(/\.\.\.and \d+ more/);
    expect(m.length).toBeLessThanOrEqual(ALERT_LIMITS.MAX_MESSAGE_CHARS);
  });

  it("stays inside a URL CallMeBot will actually accept", () => {
    // Worst case on this island: every line accented, every line long. Newlines
    // cost 3 bytes each once encoded and accents up to 6, so the character
    // count on screen is not the number that matters.
    const facts = Array.from({ length: 40 }, (_, i) => ({
      label: `Livraison ${i + 1}`,
      value: "Rivière Cocos → Baie aux Huîtres, Rs 1 250, en retard de 3 h",
    }));
    const m = ownerAlert({
      headline: "Réponse requise — 40 livraisons en retard à Port Mathurin",
      facts,
      note: "Personne n'a été assigné à ces courses.",
      actions: [{ kind: "chat", label: "WhatsApp", phone: "+23058363401" }],
    });
    // The whole GET URL, not just the message, is what has to fit.
    expect(encodedLength(m)).toBeLessThanOrEqual(ALERT_LIMITS.MAX_ENCODED_CHARS);
    // ntfy turns a body over 4096 bytes into an expiring attachment.
    expect(Buffer.byteLength(m, "utf8")).toBeLessThanOrEqual(ALERT_LIMITS.MAX_NTFY_BYTES);
  });
});

describe("money reads the way a person reads it", () => {
  it("drops noise decimals and groups thousands, from CENTS", () => {
    // "Rs 1250.00" on a lock screen is harder to read than "Rs 1,250", and
    // the separator is what stops 1250 and 12500 looking alike at a glance.
    expect(alertMoneyCents(2500)).toBe("Rs 25");
    expect(alertMoneyCents(125000)).toBe("Rs 1,250");
    // A real part-rupee price is a price somebody quoted, so it survives.
    expect(alertMoneyCents(2550)).toBe("Rs 25.50");
    expect(alertMoneyCents(null)).toBeNull();
  });

  it("keeps the two units apart", () => {
    // bookings store WHOLE RUPEES, orders and quotes store CENTS. Feeding one
    // to the other formatter is the bug that has shipped twice.
    expect(alertMoneyRupees(1800)).toBe("Rs 1,800");
    expect(alertMoneyCents(1800)).toBe("Rs 18");
  });
});

describe("links and numbers a phone can act on", () => {
  it("makes every path absolute", () => {
    // A relative path is dead text in WhatsApp and in an email client.
    const m = ownerAlert({
      headline: "x",
      actions: [{ kind: "open", label: "Open", path: "/admin/rides" }],
    });
    expect(m).toMatch(/Open: https?:\/\/[^/]+\/admin\/rides/);
    expect(absoluteUrl("https://example.com/a")).toBe("https://example.com/a");
  });

  it("prints a number the way the owner dials it", () => {
    // Eight local digits, because that is what a person keys on this island —
    // and it keeps a raw "+230..." out of the body, which every WhatsApp job
    // that has ever failed contained and no job that succeeded did.
    expect(localDial("+230 5836 3401")).toBe("5836 3401");
    expect(localDial("23058363401")).toBe("5836 3401");
    expect(localDial(null)).toBeNull();
    expect(localDial("123")).toBeNull();
  });

  it("refuses a chat tap for a number that cannot be opened", () => {
    // A wa.me with rubbish behind it looks like an action and is not one.
    expect(chatLink("not a number")).toBeNull();
    expect(chatLink("+230 5836 3401")).toBe("https://wa.me/23058363401");
    const m = ownerAlert({
      headline: "x",
      actions: [{ kind: "chat", label: "WhatsApp", phone: "abc" }],
    });
    expect(m).not.toContain("wa.me");
    expect(m).not.toContain("WhatsApp:");
  });

  it("never points at the dead vercel.app host", () => {
    // SITE_URL falls back to https://roule-rodrig.vercel.app when the env var
    // is unset, and a notification is exactly where a wrong host is found out
    // weeks later by whoever tapped it.
    const m = ownerAlert({
      headline: "x",
      actions: [{ kind: "open", label: "Open", path: "/admin" }],
    });
    expect(m).not.toContain("vercel.app");
  });
});
