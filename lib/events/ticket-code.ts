// What came out of the camera, turned into a ticket id — or nothing.
//
// A door scanner reads whatever is put in front of it: our own QR (a bare
// uuid), a code somebody pasted with a trailing newline, a URL if a ticket is
// ever re-encoded that way, and a steady stream of unrelated barcodes from
// wristbands, drink tokens and the back of a phone case. This decides which of
// those is a ticket, and it is deliberately a pure function so the awkward
// cases can be tested without a camera.
//
// It extracts rather than validates end-to-end: the server re-parses as a uuid
// and the database is what actually decides whether a ticket exists. Being
// permissive here only means a wasted round trip; being strict here would mean
// a real ticket refused at a door, which is much worse.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * The first uuid in `raw`, lower-cased, or null if there is none.
 *
 * Case is normalised because some QR encoders emit upper-case hex, and the
 * database compares uuids by value — but the API's zod schema is a string
 * check, so an upper-case id would have been rejected before reaching it.
 */
export function extractTicketId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(UUID_RE);
  return match ? match[0].toLowerCase() : null;
}
