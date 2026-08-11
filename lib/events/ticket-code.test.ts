import { describe, expect, it } from "vitest";
import { extractTicketId } from "./ticket-code";

const ID = "94a4d560-ee1e-4b6e-a0fe-0af0771084b8";

describe("extractTicketId", () => {
  it("reads our own QR payload, which is a bare uuid", () => {
    expect(extractTicketId(ID)).toBe(ID);
  });

  it("survives the whitespace a paste picks up", () => {
    expect(extractTicketId(`  ${ID}\n`)).toBe(ID);
  });

  it("normalises case, because some encoders emit upper-case hex", () => {
    // Without this a real ticket would be refused by the API's uuid check
    // before it ever reached the database — a wrong answer at a door.
    expect(extractTicketId(ID.toUpperCase())).toBe(ID);
  });

  it("finds the id inside a URL, so a re-encoded ticket still scans", () => {
    expect(extractTicketId(`https://roulerodrig.com/t/${ID}`)).toBe(ID);
    expect(extractTicketId(`https://roulerodrig.com/organizer/scan#t=${ID}`)).toBe(ID);
  });

  it("returns null for the other barcodes a door sees", () => {
    // Wristbands, drink tokens, the EAN on the back of a phone case.
    expect(extractTicketId("5901234123457")).toBeNull();
    expect(extractTicketId("WRISTBAND-4471")).toBeNull();
    expect(extractTicketId("https://example.com/nothing-here")).toBeNull();
  });

  it("returns null rather than throwing on nothing at all", () => {
    expect(extractTicketId("")).toBeNull();
    expect(extractTicketId(null)).toBeNull();
    expect(extractTicketId(undefined)).toBeNull();
  });

  it("does not accept a not-quite-uuid", () => {
    // One character short in the last group — a truncated read from a partially
    // occluded code. Admitting on this would mean querying a wrong id.
    expect(extractTicketId("94a4d560-ee1e-4b6e-a0fe-0af0771084b")).toBeNull();
    // Non-hex characters in the right shape.
    expect(extractTicketId("zzzzzzzz-ee1e-4b6e-a0fe-0af0771084b8")).toBeNull();
  });

  it("takes the FIRST id when a payload somehow carries two", () => {
    const other = "11111111-2222-3333-4444-555555555555";
    expect(extractTicketId(`${ID} ${other}`)).toBe(ID);
  });
});
