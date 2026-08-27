import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { trackErrorMessage, TRACK_ERROR_CODES } from "./track-errors";
import { RIDES_COPY } from "./copy.i18n";

const LANGS = ["en", "fr", "cr"] as const;
const ROOT = join(__dirname, "..", "..");

describe("what a stuck customer reads", () => {
  it("answers in the reader's language for every code", () => {
    for (const l of LANGS) {
      for (const code of TRACK_ERROR_CODES) {
        const msg = trackErrorMessage(l, { code });
        expect(msg, `${l}/${code}`).toBeTruthy();
        // The route's English prose must never win over a translation.
        expect(
          trackErrorMessage(l, { code, error: "Something went wrong." }),
          `${l}/${code} let the server's English through`,
        ).toBe(msg);
      }
    }
  });

  it("gives a different sentence per code, so the reason survives", () => {
    // Collapsing all three into one generic message would be a translation that
    // loses information the customer needs: "check the reference" and "try
    // again later" are different instructions.
    for (const l of LANGS) {
      const said = TRACK_ERROR_CODES.map((code) =>
        trackErrorMessage(l, { code }),
      );
      expect(new Set(said).size, l).toBe(TRACK_ERROR_CODES.length);
    }
  });

  it("says something sensible when there is nothing to go on", () => {
    for (const l of LANGS) {
      expect(trackErrorMessage(l, {}), l).toBe(
        RIDES_COPY[l].track.errors.notFound,
      );
      expect(trackErrorMessage(l, { code: null, error: null }), l).toBe(
        RIDES_COPY[l].track.errors.notFound,
      );
    }
  });

  it("prefers a newer server's sentence over a generic one", () => {
    // An unknown code is likelier a newer deployment than a bug, and its own
    // wording beats our shortest line.
    expect(
      trackErrorMessage("en", { code: "rate_limited", error: "Slow down." }),
    ).toBe("Slow down.");
  });

  it("never leaks the platform's vocabulary, in any language", () => {
    for (const l of LANGS) {
      for (const code of [...TRACK_ERROR_CODES, "unknown"]) {
        const msg = trackErrorMessage(l, { code });
        expect(
          /dispatch|radius|rayon|stage \d/i.test(msg),
          `${l}/${code}`,
        ).toBe(false);
      }
    }
  });
});

describe("the route and the mapping agree", () => {
  const route = readFileSync(
    join(ROOT, "app", "api", "rides", "track", "route.ts"),
    "utf8",
  );

  it("sends every code the mapping knows", () => {
    // The failure this catches: a code renamed on the server, so the client
    // silently falls through to the server's English prose — which is exactly
    // the bug this whole change removed.
    for (const code of TRACK_ERROR_CODES) {
      expect(route, `the route never sends "${code}"`).toContain(
        `code: "${code}"`,
      );
    }
  });

  it("still sends the prose too, for a client that predates the codes", () => {
    expect(route).toMatch(/error:\s*\n?\s*"/);
  });
});
