import "server-only";
import crypto from "crypto";
import { verifySession, COOKIE_NAME as ADMIN_COOKIE } from "@/lib/auth";
import { WORLD_IDS, isWorldId, type WorldId } from "./types";

// ── WHO MAY EDIT WHICH WORLD ────────────────────────────────────────────────
//
// The admin has exactly one credential: a shared password in ADMIN_PASSWORD,
// with no notion of individual users. That is fine for an owner editing his own
// site, and it is the reason "an editor who can only touch Curated" could not
// simply be a flag on a user row — there are no user rows.
//
// So worlds get a SECOND, deliberately weaker credential alongside the existing
// one, and the two never interfere:
//
//   rr_admin  (unchanged) → every world. The owner's session, as today.
//   rr_world  (new)       → only the worlds named in that editor's entry.
//
// Editors are configured in one environment variable, because a table of
// editors would need a screen to manage it, which would need permissions of its
// own. When there are more than a handful of them, that trade flips — see the
// note at the bottom.
//
//   WORLD_EDITORS="marie:s3cret:curated,explore;jean:hunter2:stays"
//                  name  code   worlds they may edit
//
// An editor code is NOT an admin password: it opens /admin/worlds and nothing
// else. Every other admin route still checks the admin session and is unchanged
// by this file.

export const EDITOR_COOKIE = "rr_world";
export const EDITOR_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export type WorldScope =
  | { kind: "admin"; name: string; worlds: "all" }
  | { kind: "editor"; name: string; worlds: WorldId[] };

interface EditorEntry {
  name: string;
  code: string;
  worlds: WorldId[];
}

/** Parse WORLD_EDITORS. A malformed entry is dropped, never half-trusted. */
export function parseEditors(raw = process.env.WORLD_EDITORS ?? ""): EditorEntry[] {
  return raw
    .split(";")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [name, code, worlds] = chunk.split(":");
      if (!name?.trim() || !code?.trim() || !worlds?.trim()) return null;
      const list = worlds
        .split(",")
        .map((w) => w.trim())
        .filter((w): w is WorldId => isWorldId(w));
      if (!list.length) return null;
      return { name: name.trim(), code: code.trim(), worlds: list };
    })
    .filter((e): e is EditorEntry => e !== null);
}

function signingKey(): string {
  return process.env.SESSION_SECRET || "roule-rodrigues-admin-2024";
}

/**
 * Token = `issuedAt.name.hmac`, where the hmac covers the editor's CODE.
 *
 * Binding the code means changing it in the environment invalidates that
 * editor's sessions immediately and nobody else's — which is the whole point of
 * per-editor credentials, and would be lost if the signature covered only the
 * name.
 */
function sign(issuedAt: number, entry: EditorEntry): string {
  const h = crypto
    .createHmac("sha256", signingKey())
    .update(`${issuedAt}.${entry.name}.${entry.code}.${entry.worlds.join(",")}`)
    .digest("hex");
  return `${issuedAt}.${encodeURIComponent(entry.name)}.${h}`;
}

/** Exchange a code for a session value, or null if the code is unknown. */
export function editorSessionFor(code: string): { value: string; entry: EditorEntry } | null {
  const supplied = Buffer.from(code);
  for (const entry of parseEditors()) {
    const expected = Buffer.from(entry.code);
    // Length first: timingSafeEqual throws on a mismatch. Comparing in constant
    // time keeps the response time from leaking how much of a code was right.
    if (supplied.length !== expected.length) continue;
    try {
      if (crypto.timingSafeEqual(supplied, expected)) {
        return { value: sign(Date.now(), entry), entry };
      }
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function verifyEditor(cookieValue: string | undefined): EditorEntry | null {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [issuedRaw, nameRaw] = parts;
  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > EDITOR_TTL_MS) return null;

  const name = decodeURIComponent(nameRaw);
  const entry = parseEditors().find((e) => e.name === name);
  if (!entry) return null;

  // Re-sign and compare, rather than trusting anything inside the cookie: the
  // world list comes from the environment on every request, so revoking an
  // editor's access to a world takes effect on their next click, not on their
  // next sign-in.
  const expected = sign(issuedAt, entry);
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  try {
    return crypto.timingSafeEqual(a, b) ? entry : null;
  } catch {
    return null;
  }
}

/** Who is asking, and what may they touch? `null` means "not signed in". */
export function worldScope(cookies: {
  get(name: string): { value: string } | undefined;
}): WorldScope | null {
  if (verifySession(cookies.get(ADMIN_COOKIE)?.value)) {
    return { kind: "admin", name: "Owner", worlds: "all" };
  }
  const entry = verifyEditor(cookies.get(EDITOR_COOKIE)?.value);
  if (entry) return { kind: "editor", name: entry.name, worlds: entry.worlds };
  return null;
}

export function canEdit(scope: WorldScope | null, world: string): boolean {
  if (!scope) return false;
  if (!isWorldId(world)) return false;
  if (scope.worlds === "all") return true;
  return scope.worlds.includes(world);
}

/** The worlds this scope may open, in the switcher's order. */
export function visibleWorlds(scope: WorldScope | null): WorldId[] {
  if (!scope) return [];
  if (scope.worlds === "all") return [...WORLD_IDS];
  return WORLD_IDS.filter((w) => scope.worlds.includes(w));
}

// ── When to replace this ────────────────────────────────────────────────────
//
// An environment variable is the right home for a handful of editors and the
// wrong one for a team: adding a person means a redeploy, and there is no audit
// of who granted what. The moment the owner wants to add an editor himself,
// this becomes a `world_editors` table with the same shape (name, hashed code,
// worlds) and everything above keeps working — `worldScope` is the only
// function the rest of the code calls.
