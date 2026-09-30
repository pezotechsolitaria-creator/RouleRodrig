import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { CALLMEBOT_NUMBER, CALLMEBOT_OPT_IN, extractCallMeBotKey } from "./callmebot-number";

describe("the WhatsApp code, out of whatever was pasted", () => {
  it("takes a bare code as it is", () => {
    expect(extractCallMeBotKey("1234567")).toBe("1234567");
    expect(extractCallMeBotKey("  1234567 ")).toBe("1234567");
  });

  it("takes the code out of CallMeBot's whole reply", () => {
    expect(extractCallMeBotKey("API Activated for your phone number. Your APIKEY is 1234567")).toBe("1234567");
    expect(extractCallMeBotKey("apikey: 7654321")).toBe("7654321");
  });

  it("takes the one run of digits when there is exactly one", () => {
    expect(extractCallMeBotKey("his code 5551234 thanks")).toBe("5551234");
  });

  it("refuses text with no code, or with two candidates, rather than guess", () => {
    expect(extractCallMeBotKey("I allow callmebot to send me messages")).toBeNull();
    expect(extractCallMeBotKey("12345 or 67890")).toBeNull();
    expect(extractCallMeBotKey("")).toBeNull();
    expect(extractCallMeBotKey(null)).toBeNull();
  });
});

// Three screens printed the CallMeBot number and disagreed with each other and
// with CallMeBot, whose own page (29 Sep 2026) lists only +34 611 021 695.
const SCREENS = [
  "app/d/[token]/DriverHome.tsx",
  "app/admin/notifications/AdminNotifications.tsx",
  "app/admin/AdminDashboard.tsx",
];

describe("one CallMeBot number, from one place", () => {
  it("is the number CallMeBot publishes", () => {
    expect(CALLMEBOT_NUMBER).toBe("+34 611 021 695");
    expect(CALLMEBOT_OPT_IN).toBe("I allow callmebot to send me messages");
  });

  it.each(SCREENS)("%s prints the shared constant, never a number of its own", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/import \{ CALLMEBOT_NUMBER, CALLMEBOT_OPT_IN \} from "@\/lib\/notifications\/callmebot-number";/);
    expect(src).toContain("{CALLMEBOT_NUMBER}");
    // Either retired number, in any spacing.
    expect(src).not.toMatch(/\+?34[ ]?644[ ]?(51[ ]?95[ ]?23|84[ ]?71[ ]?89)/);
  });
});
