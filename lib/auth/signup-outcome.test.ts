import { describe, it, expect } from "vitest";
import { signUpOutcome } from "./signup-outcome";

// The bug this prevents, from the production auth log: signing up with an
// address that already had an account returned 200 with no error and no email,
// and the screen said "check your inbox". The owner then guessed passwords
// three times against his own account.
describe("signUpOutcome", () => {
  it("recognises a repeated signup by its EMPTY identities array", () => {
    expect(signUpOutcome({ session: null, user: { identities: [] } })).toBe(
      "already-registered",
    );
  });

  it("treats a genuinely new user as a confirmation to wait for", () => {
    expect(
      signUpOutcome({ session: null, user: { identities: [{ id: "x" }] } }),
    ).toBe("check-email");
  });

  it("says session when confirmation is switched off", () => {
    expect(
      signUpOutcome({ session: { access_token: "t" }, user: { identities: [] } }),
    ).toBe("session");
  });

  it("never claims 'already registered' from a MISSING identities field", () => {
    // The dangerous direction. Guessing "already registered" from undefined
    // would send every genuinely new customer to sign in to an account that
    // does not exist — worse than the bug being fixed.
    expect(signUpOutcome({ session: null, user: {} })).toBe("check-email");
    expect(signUpOutcome({ session: null, user: { identities: null } })).toBe(
      "check-email",
    );
    expect(signUpOutcome({ session: null, user: null })).toBe("check-email");
    expect(signUpOutcome(null)).toBe("check-email");
    expect(signUpOutcome({})).toBe("check-email");
  });
});
