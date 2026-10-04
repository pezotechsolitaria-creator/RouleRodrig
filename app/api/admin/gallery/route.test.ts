import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { fakeDb, type FakeDb } from "@/test/fake-supabase-tables";
import { DEFAULT_CONTENT } from "@/lib/defaults";

// ── A GALLERY DELETE MUST NOT LOCK THE STUDIO OUT OF ITS OWN SAVE ───────────
// (architecture review 2026-09-30, content-studio save safety, item 4)
//
// The studio sends the version it loaded with every save, and the server
// refuses a save made from an older one. The gallery delete wrote the same row
// with no version and returned none, so after one photo was deleted every
// later Save in that tab was refused as "Someone saved in another tab" — and
// the only way out, a reload, lost every unsaved edit.
//
// These drive the studio's real client helper (app/admin/gallery-delete.ts)
// into the real DELETE handler, then the real content PUT, against an
// in-memory site_content row, and assert on the row.

let db: FakeDb;
let authed = true;
const blobDel = vi.fn();

vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => db.client }));
vi.mock("@/lib/supabase/admin", () => ({
  getPrivileged: async () => db.client,
  hasServiceRole: () => true,
}));
vi.mock("@/lib/auth", () => ({ verifySession: () => authed, COOKIE_NAME: "rr_admin" }));
vi.mock("@vercel/blob", () => ({ del: (...a: unknown[]) => blobDel(...a) }));

const { DELETE } = await import("./route");
const { PUT, GET } = await import("../content/route");
const { deleteGalleryPhoto, snapshotWithoutPhoto } = await import("@/app/admin/gallery-delete");
const { CONTENT_CONFLICT_MESSAGE, OFFLINE_SAVE_MESSAGE } = await import("@/lib/admin/content-version");

const V1 = "2026-09-30T08:00:00.123456+00:00";
const SRC_A = "https://blob.example/gallery/a.jpg";
const SRC_B = "https://blob.example/gallery/b.jpg";

function seeded() {
  const c = JSON.parse(JSON.stringify(DEFAULT_CONTENT));
  c.gallery = [
    { id: "img-a", src: SRC_A, alt: "a", uploadedAt: "2026-09-01T00:00:00.000Z" },
    { id: "img-b", src: SRC_B, alt: "b", uploadedAt: "2026-09-02T00:00:00.000Z" },
  ];
  return c;
}

const row = () => db.tables.site_content[0] as { data: { gallery: { id: string }[] } & Record<string, unknown>; updated_at: string };
const galleryIds = () => row().data.gallery.map((g) => g.id);

/** What the studio's fetch reaches: the real DELETE handler. */
const send = (url: string, init: RequestInit) =>
  DELETE(new NextRequest(`http://localhost${url}`, init as ConstructorParameters<typeof NextRequest>[1]));

/** The studio's Save: the real PUT, with the version the studio holds. */
function save(body: unknown, base: string) {
  return PUT(
    new NextRequest("http://localhost/api/admin/content", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-content-base": base },
      body: JSON.stringify(body),
    }),
  );
}

/** The studio as it opens: the editor's read of the row, and its version. */
async function openStudio() {
  const res = await GET(new NextRequest("http://localhost/api/admin/content"));
  return { content: await res.json(), version: res.headers.get("x-content-base") as string };
}

beforeEach(() => {
  authed = true;
  db = fakeDb({ site_content: [{ id: "main", data: seeded(), updated_at: V1 }] });
  blobDel.mockClear();
});

describe("deleting a photo, then saving, in the same studio tab", () => {
  it("hands back the new version, and a Save on it lands instead of a 409", async () => {
    const studio = await openStudio();
    expect(studio.version).toBe(V1);

    const outcome = await deleteGalleryPhoto("img-a", studio.version, send);
    expect(outcome.kind).toBe("saved");
    const next = outcome.kind === "saved" ? outcome.version : null;
    expect(next).toBe(row().updated_at);
    expect(next).not.toBe(V1);
    expect(galleryIds()).toEqual(["img-b"]);

    // The owner's unsaved edit elsewhere, then Save from the adopted version.
    const local = { ...studio.content, gallery: studio.content.gallery.filter((g: { id: string }) => g.id !== "img-a") };
    local.hero = { ...local.hero, subheadline: "Edited before the photo went" };
    const res = await save(local, next as string);

    expect(res.status).toBe(200);
    expect(row().data.hero).toMatchObject({ subheadline: "Edited before the photo went" });
    expect(galleryIds()).toEqual(["img-b"]);
  });

  it("the version the tab loaded is no longer good after the delete — adopting it is required", async () => {
    // What the studio sent before this fix: its untouched base version.
    const studio = await openStudio();
    await deleteGalleryPhoto("img-a", studio.version, send);
    const res = await save(studio.content, studio.version);
    expect(res.status).toBe(409);
  });

  it("a second delete straight after the first goes through on the adopted version", async () => {
    const studio = await openStudio();
    const first = await deleteGalleryPhoto("img-a", studio.version, send);
    const v2 = first.kind === "saved" ? first.version : null;
    const second = await deleteGalleryPhoto("img-b", v2, send);
    expect(second.kind).toBe("saved");
    expect(galleryIds()).toEqual([]);
  });

  it("deletes the file only after the row stops pointing at it", async () => {
    let galleryWhenFileWent: string[] | null = null;
    blobDel.mockImplementation(() => {
      galleryWhenFileWent = galleryIds();
    });
    await deleteGalleryPhoto("img-a", V1, send);
    expect(blobDel).toHaveBeenCalledWith(SRC_A);
    expect(galleryWhenFileWent).toEqual(["img-b"]);
  });
});

describe("the delete still refuses a real conflict", () => {
  it("another tab saved since: 409 in the owner's words, row and file untouched", async () => {
    row().updated_at = "2026-09-30T09:15:00.000+00:00";
    const outcome = await deleteGalleryPhoto("img-a", V1, send);
    expect(outcome).toEqual({ kind: "conflict", message: CONTENT_CONFLICT_MESSAGE });
    expect(galleryIds()).toEqual(["img-a", "img-b"]);
    expect(blobDel).not.toHaveBeenCalled();
    expect(db.calls.some((c) => c.table === "site_content" && c.op !== "select")).toBe(false);
  });

  it("lost a same-second race: the conditional write refuses and the file stays", async () => {
    db.beforeWrite = (call) => {
      if (call.table === "site_content" && call.op === "update") {
        row().updated_at = "2026-09-30T08:00:01.000+00:00";
      }
    };
    const outcome = await deleteGalleryPhoto("img-a", V1, send);
    expect(outcome.kind).toBe("conflict");
    expect(galleryIds()).toEqual(["img-a", "img-b"]);
    expect(blobDel).not.toHaveBeenCalled();
  });

  it("a request with no version (a page from before this shipped) is asked to reload", async () => {
    const res = await DELETE(new NextRequest("http://localhost/api/admin/gallery?id=img-a", { method: "DELETE" }));
    expect(res.status).toBe(428);
    expect((await res.json()).error).toMatch(/reload/i);
    expect(galleryIds()).toEqual(["img-a", "img-b"]);
    expect(blobDel).not.toHaveBeenCalled();
  });
});

describe("the other ways a delete ends, as the studio sees them", () => {
  it("a photo this tab added but never saved comes back as not-saved, row untouched", async () => {
    const outcome = await deleteGalleryPhoto("img-only-on-screen", V1, send);
    expect(outcome).toEqual({ kind: "not-saved" });
    expect(galleryIds()).toEqual(["img-a", "img-b"]);
    expect(row().updated_at).toBe(V1);
  });

  it("an expired session sends the owner to sign in", async () => {
    authed = false;
    expect(await deleteGalleryPhoto("img-a", V1, send)).toEqual({ kind: "expired" });
    expect(galleryIds()).toEqual(["img-a", "img-b"]);
  });

  it("no network is said in words, not thrown", async () => {
    const offline = () => Promise.reject(new TypeError("Failed to fetch"));
    expect(await deleteGalleryPhoto("img-a", V1, offline)).toEqual({ kind: "refused", message: OFFLINE_SAVE_MESSAGE });
  });
});

describe("the studio's saved snapshot after a delete", () => {
  // The studio's dirty flag is JSON.stringify(content) !== savedSnapshot.
  it("drops only the photo: no other edits means nothing left unsaved", () => {
    const saved = seeded();
    const onScreen = { ...saved, gallery: saved.gallery.filter((g: { id: string }) => g.id !== "img-a") };
    expect(JSON.stringify(onScreen)).toBe(snapshotWithoutPhoto(JSON.stringify(saved), "img-a"));
  });

  it("keeps an unsaved edit unsaved — the delete did not write it", () => {
    const saved = seeded();
    const onScreen = { ...saved, gallery: saved.gallery.filter((g: { id: string }) => g.id !== "img-a") };
    onScreen.hero = { ...onScreen.hero, subheadline: "Not saved yet" };
    expect(JSON.stringify(onScreen)).not.toBe(snapshotWithoutPhoto(JSON.stringify(saved), "img-a"));
  });
});
