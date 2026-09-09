import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const CONTENT = readFileSync("lib/content.ts", "utf8");
const VERCEL = JSON.parse(readFileSync("vercel.json", "utf8")) as {
  crons?: { path: string; schedule: string }[];
};

// ── The cache guard ─────────────────────────────────────────────────────────
//
// saveContent() calls revalidateTag() and the site updates instantly. That
// works perfectly and protects nothing: it only fires for writes that came
// through the admin route.
//
// A write arriving any other way — a psql session, a migration, an assistant
// with database access marking seven places popular — left the public site
// serving the old blob for up to an HOUR, with no signal anywhere. The data is
// right, every page is wrong, and nothing says so.
//
// Not hypothetical. That happened on 7 Sep 2026 and the write was mine.

describe("a write from anywhere eventually shows", () => {
  it("keys the cached blob on the row's own updated_at", () => {
    // This is the whole guard. A write moves updated_at, updated_at moves the
    // cache key, and a key with no entry fetches the real thing. Nobody has to
    // remember to invalidate anything, which is the point — the writer who
    // forgets is exactly the case the tag already fails to cover.
    expect(CONTENT).toMatch(/\['site-content-main', version\]/);
    expect(CONTENT).toMatch(/select\('updated_at'\)/);
  });

  it("reads the version, not the blob, to check freshness", () => {
    // One timestamp — about thirty bytes — against the 148 kB blob beside it.
    // Checking freshness by re-reading the content would undo the entire reason
    // this file caches: 35 GB/month of egress down to almost nothing.
    const versionRead = CONTENT.slice(
      CONTENT.indexOf("const readContentVersion"),
      CONTENT.indexOf("export async function getContent"),
    );
    expect(versionRead).toMatch(/select\('updated_at'\)/);
    expect(versionRead).not.toMatch(/select\('data'\)/);
  });

  it("keeps the blob cached for the full hour", () => {
    // The window that shortened is the VERSION check. The expensive read is
    // still hourly, and only refetches when the version actually changed.
    expect(CONTENT).toMatch(/\['site-content-main', version\][\s\S]{0,120}revalidate: 3600/);
  });

  it("does not answer a database blip by fetching 148 kB per request", () => {
    // If the version read throws, falling through to the uncached path would
    // serve the whole blob to every visitor until it recovered — the precise
    // failure this file's egress note was written about. A fixed key keeps the
    // cached copy, which is exactly the behaviour before the guard existed.
    expect(CONTENT).toMatch(/let version = 'unversioned'/);
    const guard = CONTENT.slice(CONTENT.indexOf("let version = 'unversioned'"));
    expect(guard.slice(0, 260)).toMatch(/catch \{/);
  });
});

describe("why this is not a cron", () => {
  it("vercel.json is at the cron cap, so a fourth would break every deploy", () => {
    // A fourth entry makes deployments fail BEFORE they build, silently. That
    // is the reason the obvious fix was not taken, and if this ever drops below
    // the cap the comment in lib/content.ts should be revisited rather than
    // left as a stale justification.
    expect(VERCEL.crons ?? []).toHaveLength(3);
  });

  it("and every cron there runs daily, which is worse than the hour it fixes", () => {
    // A guard on a daily schedule would have given a WORSE guarantee than the
    // hourly expiry it was meant to protect against — a guard that guards
    // nothing, which is worse than none because it looks like something.
    for (const c of VERCEL.crons ?? []) {
      const [, hour, dom, month, dow] = c.schedule.split(/\s+/);
      expect(hour, `${c.path} is not daily`).not.toBe("*");
      expect([dom, month, dow].join(" ")).toBe("* * *");
    }
  });
});

describe("the instant path is untouched", () => {
  it("saveContent still busts the tag, so admin edits do not wait 15 minutes", () => {
    // The guard is a safety net, not a replacement. Pressing Save must still
    // change the site immediately.
    expect(CONTENT).toMatch(/revalidateTag\(CONTENT_TAG, \{ expire: 0 \}\)/);
  });
});
