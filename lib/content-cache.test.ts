import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── THE 35 GB/MONTH ROW, AND THE RULE THAT MAKES CACHING IT SAFE ────────────
//
// site_content 'main' is 148,807 bytes. In the 24 hours to 6 Sep 2026 the Data
// API served `?select=data&id=eq.main` 7,825 times — 1.16 GB a day, ~35 GB a
// month, against a 5 GB free-plan allowance — while the row itself was written
// 23 times in three months.
//
// So getContent() is now cached across requests and invalidated when the owner
// saves. That is safe for the public site and DANGEROUS for /admin: an editor
// seeded from a stale copy of a whole-site blob, saved back, silently reverts
// the owner's work. The split is the safety property, and it is one import
// statement away from being undone by someone tidying up.

const CONTENT = readFileSync(join(process.cwd(), "lib/content.ts"), "utf8");

describe("the public read is cached, and invalidated by the only writer", () => {
  it("caches across requests under a tag", () => {
    expect(CONTENT).toMatch(/const readPublicContent = unstable_cache\(/);
    expect(CONTENT).toMatch(/tags: \[CONTENT_TAG\]/);
  });

  it("refuses to cache a failed read", () => {
    // unstable_cache stores whatever it is handed. Returning defaults on a DB
    // blip would pin the seed copy over the live site for the whole window; a
    // throw is not cached, so the next request retries.
    const fn = CONTENT.slice(CONTENT.indexOf("const readPublicContent"));
    expect(fn).toMatch(/if \(!loaded\) throw/);
  });

  it("revalidates the tag inside saveContent", () => {
    const save = CONTENT.slice(CONTENT.indexOf("export async function saveContent"));
    expect(save).toMatch(/revalidateTag\(CONTENT_TAG/);
    // After the write, never before — revalidating a tag then failing to write
    // would serve the old copy while claiming it was refreshed.
    expect(save.indexOf("revalidateTag")).toBeGreaterThan(save.indexOf("if (error) throw"));
  });
});

describe("/admin never reads the cached copy", () => {
  it("uses getContentWithStatus everywhere under app/admin", () => {
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const src = readFileSync(full, "utf8");
          // Strip comments: the explanations below legitimately name getContent().
          const code = src
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .split(/\r?\n/)
            .filter((l) => !l.trim().startsWith("//"))
            .join("\n");
          if (/\bawait getContent\(\)/.test(code)) {
            offenders.push(full.replace(process.cwd(), ""));
          }
        }
      }
    };
    walk(join(process.cwd(), "app/admin"));
    walk(join(process.cwd(), "app/api/admin"));

    expect(
      offenders,
      `These read the cross-request cache and then let the owner save it back:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
