import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { RIDES_COPY, KREOL_NEEDS_REVIEW } from "./copy.i18n";

// /taxi/track said "Checking drivers near you…" for every ride still 'new' —
// including an airport pickup booked on 20 Sep for 5 Oct, whose search does
// not start until the day before. The line now says when it will start.
describe("the tracking page, for a ride booked ahead", () => {
  it("says when the search starts, in every language", () => {
    expect(RIDES_COPY.en.track.status.booked("5 Oct, 19:00", true))
      .toBe("Requested for 5 Oct, 19:00. We'll start finding your driver the day before, and they'll appear here.");
    expect(RIDES_COPY.en.track.status.booked("1 Oct, 12:00", false)).toContain("a few hours before");
    expect(RIDES_COPY.fr.track.status.booked("5 oct., 19:00", true)).toContain("la veille");
    expect(RIDES_COPY.cr.track.status.booked("5 oct., 19:00", true)).toContain("la veille");
  });

  it("flags the Kreol line for a native speaker instead of inventing it", () => {
    expect(KREOL_NEEDS_REVIEW).toContainEqual({ path: "track.status.booked", fallback: "fr" });
    // French fallback until then: identical to the French line.
    expect(RIDES_COPY.cr.track.status.booked("x", true)).toBe(RIDES_COPY.fr.track.status.booked("x", true));
  });

  it("shows it only while the search has not started, and the search lines after", () => {
    const page = readFileSync("app/taxi/track/TrackRide.tsx", "utf8");
    expect(page).toMatch(/import \{ searchStartsAt \} from "@\/lib\/rides\/dispatch-timing";/);
    expect(page).toMatch(/const bookedAhead = status === "new" && !!ride && searchStartsAt\(ride\) !== null;/);
    expect(page).toMatch(/\{bookedAhead && ride\.scheduledAt && \(/);
    expect(page).toMatch(/status === "dispatching" \|\| \(status === "new" && !bookedAhead\)/);
  });
});

describe("the other lines a customer was told that were not true", () => {
  it("the booking screen says when the search starts for a ride booked ahead", () => {
    expect(RIDES_COPY.en.book.done.bookedBody("5 Oct, 19:00", true))
      .toBe("No need to call anyone. We'll start finding your driver the day before your pickup on 5 Oct, 19:00, and you'll see their name and number here.");
    const book = readFileSync("app/taxi/book/BookRide.tsx", "utf8");
    expect(book).toMatch(/const bookedAhead = searchStartsAt\(\{ service, whenKind, scheduledAt: scheduledIso \}\) !== null;/);
  });

  it("a stranded ride no longer says every driver is busy", () => {
    // In the real case nobody was busy: the offer reached nobody, or drivers declined.
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(RIDES_COPY[lang].track.step2.noDriverHelp).not.toMatch(/busy|pris pour le moment|okipe/i);
    }
  });

  it("a no-show has words, and the page stops polling for it", () => {
    expect(RIDES_COPY.en.track.status.noShow.heading).toBe("Your driver couldn't find you");
    const page = readFileSync("app/taxi/track/TrackRide.tsx", "utf8");
    expect(page).toMatch(/const isNoShow = \(status as string \| undefined\) === "no_show";/);
    expect(page).toMatch(/s === "completed" \|\| s === "cancelled" \|\| \(s as string\) === "no_show"/);
  });

  it("the email hint promises only what is true", () => {
    for (const lang of ["en", "fr", "cr"] as const) {
      expect(RIDES_COPY[lang].book.step3.emailHint).not.toMatch(/Nothing else is sent|Rien d’autre|Nanye dot/);
    }
  });

  it("every new Kreol slot is French and on the review list", () => {
    for (const path of ["book.done.bookedHeading", "book.done.bookedBody", "book.step3.emailHint", "track.step2.noDriverHelp", "track.status.noShow.heading", "track.status.noShow.body"]) {
      expect(KREOL_NEEDS_REVIEW, path).toContainEqual({ path, fallback: "fr" });
    }
    expect(RIDES_COPY.cr.book.done.bookedHeading).toBe(RIDES_COPY.fr.book.done.bookedHeading);
    expect(RIDES_COPY.cr.track.step2.noDriverHelp).toBe(RIDES_COPY.fr.track.step2.noDriverHelp);
  });
});
