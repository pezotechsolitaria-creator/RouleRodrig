// ── What this phone already knows about you ─────────────────────────────────
//
// ── THE PROBLEM THIS SOLVES ────────────────────────────────────────────────
// Every request on this surface asked for a name and a phone number from
// scratch, every time, forever. For a signed-in customer that is merely rude.
// For a GUEST — which is nearly everybody here, because the flow is deliberately
// usable without an account — it is the same twenty seconds of typing on a
// numeric keypad on every single order.
//
// DoorDash calls this "saved addresses" and "account profile" and puts it behind
// a login. It does not need a login. Both halves of it are facts about the
// handset, not about an identity, and the handset already has somewhere to keep
// them.
//
// ── TWO THINGS, ONE FILE ───────────────────────────────────────────────────
// THE CONTACT is your name, number and email, written on a successful post and
// prefilled on the next one. Editable, obviously — it is a starting point, not a
// claim about who is holding the phone.
//
// RECENT PLACES are the last few you actually chose. This is the more valuable
// half: the eight common places in the picker are the island's answer, and these
// are YOURS. Somebody who sends things to their mother in Rivière Cocos every
// month should find Rivière Cocos at the top, and after one order they do.
//
// ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
// No favourite drivers. That belongs to the marketplace and would have to be
// server-side to mean anything — a "favourite" that only this browser knows
// cannot be routed to, so it would be a star that does nothing. It is a real
// feature and it is a real feature to build LATER, with a table behind it.
//
// Pure over an injected Storage, like lib/delivery/my-requests.ts: testable
// without a DOM, and a browser with storage blocked degrades to an empty form
// rather than throwing on module load.

export type RememberedContact = {
  name: string;
  phone: string;
  email: string;
};

export type RememberedPlace = {
  id: string;
  name: string;
  area: string;
  lat: number | null;
  lng: number | null;
};

const CONTACT_KEY = "rr_delivery_contact";
const PLACES_KEY = "rr_delivery_places";

/** Four is the number that fits above the fold beside the common places
 *  without turning the picker back into a list you have to read. */
const MAX_PLACES = 4;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function read<T>(store: StorageLike | null, key: string, guard: (v: unknown) => v is T): T | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(store: StorageLike | null, key: string, value: unknown): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* quota, or storage revoked between read and write */
  }
}

// ── The contact ─────────────────────────────────────────────────────────────

function isContact(v: unknown): v is RememberedContact {
  if (!v || typeof v !== "object") return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.name === "string" && typeof c.phone === "string" && typeof c.email === "string"
  );
}

export function readContact(store: StorageLike | null = storage()): RememberedContact | null {
  const c = read(store, CONTACT_KEY, isContact);
  // A stored blank is the same as nothing stored, and prefilling empty strings
  // over empty strings is a write nobody benefits from.
  if (!c || (!c.name.trim() && !c.phone.trim())) return null;
  return c;
}

export function rememberContact(
  c: RememberedContact,
  store: StorageLike | null = storage(),
): void {
  write(store, CONTACT_KEY, {
    name: c.name.trim(),
    phone: c.phone.trim(),
    email: c.email.trim().toLowerCase(),
  });
}

export function forgetContact(store: StorageLike | null = storage()): void {
  if (!store) return;
  try {
    store.removeItem(CONTACT_KEY);
  } catch {
    /* see write */
  }
}

// ── Recent places ───────────────────────────────────────────────────────────

function isPlace(v: unknown): v is RememberedPlace {
  if (!v || typeof v !== "object") return false;
  const p = v as Record<string, unknown>;
  return typeof p.id === "string" && typeof p.name === "string" && p.name.length > 0;
}

export function readPlaces(store: StorageLike | null = storage()): RememberedPlace[] {
  if (!store) return [];
  try {
    const raw = store.getItem(PLACES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPlace).slice(0, MAX_PLACES);
  } catch {
    return [];
  }
}

/**
 * Most recent first, no duplicates.
 *
 * Keyed on the NAME rather than the id, because two of the ids are not
 * identities: everything typed by hand arrives as "custom", and every position
 * from the phone arrives as "gps". Keying on id would let one hand-typed
 * address overwrite the last one and make "My current location" the only
 * remembered place anybody ever had.
 */
export function rememberPlace(
  place: RememberedPlace | null,
  store: StorageLike | null = storage(),
): RememberedPlace[] {
  if (!place || !place.name.trim()) return readPlaces(store);
  // A live GPS fix is not a place you can return to — the coordinates were
  // wherever you were standing that day. Remembering it would put "My current
  // location" at the top of the list pointing at last week's position.
  if (place.id === "gps") return readPlaces(store);

  const key = place.name.trim().toLowerCase();
  const merged = [
    place,
    ...readPlaces(store).filter((p) => p.name.trim().toLowerCase() !== key),
  ].slice(0, MAX_PLACES);
  write(store, PLACES_KEY, merged);
  publish(merged);
  return merged;
}

// ── Reading it from React without lying to the server ───────────────────────
//
// localStorage cannot be read during render: the server has no idea what is in
// it, so the two renders disagree and React discards the tree — on the control
// carrying the hardest question on the form. The usual dodge is an effect that
// calls setState on mount, which works and which the React Compiler lint flags,
// correctly, as a cascading render.
//
// useSyncExternalStore is the primitive built for exactly this: a server
// snapshot (empty — the server genuinely knows nothing), a client snapshot, and
// a subscription. It also buys something the effect never had: two pickers open
// on the same screen stay in step, because rememberPlace publishes.
//
// The snapshot MUST be reference-stable between calls or the hook re-renders
// for ever, which is why it is cached rather than re-read.

const EMPTY: RememberedPlace[] = [];
let snapshot: RememberedPlace[] | null = null;
const listeners = new Set<() => void>();

function publish(next: RememberedPlace[]): void {
  snapshot = next;
  for (const l of listeners) l();
}

export function subscribePlaces(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => void listeners.delete(onChange);
}

export function placesSnapshot(): RememberedPlace[] {
  if (snapshot === null) snapshot = readPlaces();
  return snapshot;
}

/** The server knows nothing about this phone, and says so. */
export function placesServerSnapshot(): RememberedPlace[] {
  return EMPTY;
}
