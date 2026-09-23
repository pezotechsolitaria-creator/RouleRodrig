import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PAYMENT, PAY_HOW, payToLine, payToLines } from "./payment-details";

// ── ONE ACCOUNT, AND A TEST THAT KEEPS IT THAT WAY ──────────────────────────
//
// The account number was a literal in two files. Nothing connected them, so
// changing one and forgetting the other would have pointed /manage-booking and
// the confirmation email at different accounts — and the customer who read the
// wrong one would have paid into somewhere nobody watches, with no error
// anywhere and no way to find out except being asked where the money went.
//
// This walks the source tree and fails if a second copy ever appears.

const ROOT = process.cwd();
const SKIP = new Set([
  "node_modules", ".next", ".git", "dist", "build", ".vercel", "coverage",
]);
const EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function sourceFiles(dir = ROOT, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry) || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) sourceFiles(full, out);
    else if (EXT.test(entry)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles();

describe("the payment destination exists once", () => {
  it("finds the source tree at all", () => {
    // A tripwire: an empty file list would make every test below vacuously
    // pass, which is the failure mode of a walker with a wrong root.
    expect(FILES.length).toBeGreaterThan(200);
  });

  it("names the account number in exactly one module", () => {
    const carriers = FILES.filter((f) =>
      readFileSync(f, "utf8").includes(PAYMENT.account),
    )
      .map((f) => relative(ROOT, f).replace(/\\/g, "/"))
      // This file quotes it too, to assert what it is.
      .filter((f) => f !== "lib/payment-details.test.ts");
    expect(carriers.sort()).toEqual(["lib/payment-details.ts"]);
  });

  it("has no stray account-number-shaped literal left anywhere", () => {
    // Mauritian account numbers are twelve digits, usually leading with zeros.
    // Catches a copy that was edited rather than deleted — including the old
    // 000447902350, which was live on two surfaces until 23 September 2026.
    const stray: string[] = [];
    for (const f of FILES) {
      const rel = relative(ROOT, f).replace(/\\/g, "/");
      // Tests are exempt: lib/posthog-scrub.test.ts legitimately carries a
      // FAKE account number as the input it proves gets scrubbed. Nothing in a
      // test file reaches a customer, and this scan is about what does.
      if (rel === "lib/payment-details.ts" || /\.test\.[tj]sx?$/.test(rel)) continue;
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/["'`](0\d{11})["'`]/g)) {
        stray.push(`${rel}: ${m[1]}`);
      }
    }
    expect(stray).toEqual([]);
  });

  it("still refuses the old account, by name", () => {
    // Named explicitly so the failure message says what went wrong rather than
    // just "a twelve-digit string".
    const old = "000447902350";
    const carriers = FILES.filter((f) => readFileSync(f, "utf8").includes(old))
      .map((f) => relative(ROOT, f).replace(/\\/g, "/"))
      .filter((f) => f !== "lib/payment-details.test.ts");
    expect(carriers).toEqual([]);
  });
});

describe("what a payer is told", () => {
  it("is the MCB Juice destination and the bank account at once", () => {
    // The owner's instruction: the account number, not a phone number. A Juice
    // transfer keyed on a mobile resolves against whoever holds that number
    // today; an account number resolves against the account.
    expect(PAYMENT.account).toBe("000456593438");
    expect(PAY_HOW).toContain("Juice");
    expect(payToLine()).toContain(PAYMENT.account);
  });

  it("names who the account belongs to", () => {
    // A banking app asks who you are paying before it asks for the number.
    expect(PAYMENT.accountName).toBe("Roulé Rodrigues");
    expect(payToLines().join(" ")).toContain(PAYMENT.accountName);
  });

  it("keeps the one-line form short enough to print without shrinking", () => {
    // The document's "How to pay" band fits a single row and the renderer
    // shrinks anything wider. A shrunken account number is a mistyped one.
    expect(payToLine().length).toBeLessThanOrEqual(48);
  });

  it("prints every character in the font the PDF actually has", () => {
    // WinAnsiEncoding, or it reaches the page as "?".
    for (const s of [payToLine(), ...payToLines(), PAYMENT.bank, PAYMENT.accountName]) {
      for (const ch of s) {
        expect(ch.codePointAt(0)!, `${s} -> ${ch}`).toBeLessThanOrEqual(0xff);
      }
    }
  });
});

describe("every surface reads the module", () => {
  const reads = (p: string) => readFileSync(join(ROOT, p), "utf8");

  it("the emails and the documents", () => {
    const email = reads("lib/email.ts");
    expect(email).toContain('from "./payment-details"');
    expect(email).toContain("const PAY_ACCOUNT = PAYMENT.account;");
  });

  it("the page a customer pays from", () => {
    const panel = reads("components/BankTransferDetails.tsx");
    expect(panel).toContain('from "@/lib/payment-details"');
    expect(panel).toContain("{PAYMENT.account}");
    // The copy button must copy the real thing, not a stale local.
    expect(panel).toContain("writeText(PAYMENT.account)");
  });

  it("names Juice in all three languages, not only English", () => {
    // Most people on the island pay with Juice. A label reading only "bank
    // transfer" sends somebody looking for a branch app.
    const panel = reads("components/BankTransferDetails.tsx");
    for (const lang of ["en:", "fr:", "cr:"]) {
      const at = panel.indexOf(lang);
      expect(at, lang).toBeGreaterThan(-1);
      expect(panel.slice(at, at + 400), lang).toContain("Juice");
    }
  });
});
