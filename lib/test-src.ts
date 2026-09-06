import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A source file with its comments stripped, for tests that assert on shipped code.
 *
 * Needed because a comment explaining why something is gone legitimately
 * contains the thing it says is gone: the earnings block's header explains at
 * length that there is no payout, and a test asserting the rendered page never
 * says "payout" would fail on the explanation rather than the page.
 *
 * Shared rather than copied. It had been written twice already and the second
 * copy is what these two test files were arguing about.
 */
export function sourceWithoutComments(path: string[]): string {
  return readFileSync(join(process.cwd(), ...path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}
