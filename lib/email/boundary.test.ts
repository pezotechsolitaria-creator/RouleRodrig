import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ── Server/client boundary (§22 of the email brief) ─────────────────────────
//
// An assertion, not a convention. The audit found the boundary clean, and the
// only thing that keeps it clean through future edits is a test that fails when
// somebody imports the email layer into a component.
//
// A bundled provider key is not a bug you notice — it ships, it works, and the
// key is public until somebody reads the JS.

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !/\.test\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const sourceFiles = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components")), ...walk(join(ROOT, "lib"))];

// Every check below scans the same few hundred files. Reading them once here
// rather than once per test turns four full passes over app/ + components/ +
// lib/ into one. These tests were crossing vitest's 5s default timeout under
// full-suite load and failing while passing in isolation — which reads exactly
// like a real regression and teaches people to re-run instead of look.
const cache = new Map<string, string>();
const read = (f: string): string => {
  let src = cache.get(f);
  if (src === undefined) { src = readFileSync(f, "utf8"); cache.set(f, src); }
  return src;
};

const isClientComponent = (src: string) => /^\s*(["'])use client\1/m.test(src.slice(0, 400));

const EMAIL_IMPORT = /from\s+["'](@\/lib\/email(\/[^"']*)?|\.{1,2}\/(email|providers)(\/[^"']*)?)["']/;

describe("email layer never reaches the browser", () => {
  it("finds source files to check (guards against a silently empty test)", () => {
    expect(sourceFiles.length).toBeGreaterThan(50);
  });

  it("is not imported by any client component", () => {
    const offenders = sourceFiles
      .filter((f) => {
        const src = read(f);
        return isClientComponent(src) && EMAIL_IMPORT.test(src);
      })
      .map((f) => relative(ROOT, f));
    expect(offenders, `client components importing the email layer: ${offenders.join(", ")}`).toEqual([]);
  });

  it("never exposes a provider credential through a NEXT_PUBLIC_ variable", () => {
    // NEXT_PUBLIC_* is inlined into the client bundle by definition, so the name
    // alone is the vulnerability — no import needed.
    const offenders = sourceFiles
      .filter((f) => /NEXT_PUBLIC_[A-Z_]*(RESEND|BREVO|SMTP|MAIL|SENDGRID|POSTMARK)/.test(read(f)))
      .map((f) => relative(ROOT, f));
    expect(offenders, `files exposing a mail credential publicly: ${offenders.join(", ")}`).toEqual([]);
  });

  it("guards every module that can touch credentials or the database with server-only", () => {
    // `import "server-only"` turns a client import into a BUILD error rather
    // than a shipped key. lib/email.ts was missing this before M41 — nothing
    // imported it client-side, but nothing would have stopped that either.
    //
    // EXEMPT: lib/email/types.ts. It is a pure registry of type names,
    // categories and priorities — no credentials, no database, no fetch. Adding
    // server-only there would be cargo-cult rather than protection, and it would
    // block a future client component that legitimately wants to label an email
    // type. The rule is about what can leak, not about which folder it sits in.
    const exempt = new Set(["lib/email/types.ts"]);
    const emailModules = [...walk(join(ROOT, "lib", "email")), join(ROOT, "lib", "email.ts")];
    const unguarded = emailModules
      .filter((f) => !/\.test\.ts$/.test(f))
      .filter((f) => !exempt.has(relative(ROOT, f).split("\\").join("/")))
      .filter((f) => !/^\s*import\s+["']server-only["']/m.test(read(f)))
      .map((f) => relative(ROOT, f));
    expect(unguarded, `email modules missing server-only: ${unguarded.join(", ")}`).toEqual([]);
  });

  it("keeps API keys out of every log line in the email layer", () => {
    // Error paths log status codes and classifications. A template literal that
    // interpolates a key variable into console.* would put it in Vercel's logs.
    const emailModules = [...walk(join(ROOT, "lib", "email")), join(ROOT, "lib", "email.ts")].filter(
      (f) => !/\.test\.ts$/.test(f),
    );
    const offenders: string[] = [];
    for (const f of emailModules) {
      for (const line of readFileSync(f, "utf8").split("\n")) {
        if (!/console\.(log|error|warn|info)/.test(line)) continue;
        if (/\b(apiKey|apikey|key|resendKey|brevoKey|secret|token)\b\s*[,)]|\$\{\s*(key|apiKey|apikey|secret|token)\s*\}/.test(line)) {
          offenders.push(`${relative(ROOT, f)}: ${line.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders, `possible credential in a log line: ${offenders.join(" | ")}`).toEqual([]);
  });
});
