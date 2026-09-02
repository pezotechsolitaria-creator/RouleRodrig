import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// ── A standing guard on the header that switched the cameras off ────────────
//
// `Permissions-Policy: camera=()` disabled the camera for EVERY origin,
// including this one. The consequence was that navigator.mediaDevices
// .getUserMedia() threw NotAllowedError before the browser offered a prompt, so
// the QR scanner at an event door could never start — and the message it showed
// ("Camera permission was refused. Allow it in your browser settings") sent the
// person holding the phone to a setting that could not have fixed it.
//
// It is an easy line to "tighten" back to `()` during a security pass, because
// an empty allowlist looks strictly safer and the scanner is not something you
// exercise while editing headers. This test makes that a red build instead of a
// door that stops working at the next event.
//
// Read from the shipped config rather than from a live response: the point is
// to fail on the COMMIT, which is the only moment the fix is cheap.

const config = readFileSync("next.config.ts", "utf8");

function permissionsPolicy(): string {
  // The value sits in a template of its own, so match the header block rather
  // than guessing at whitespace.
  const m = config.match(/key:\s*"Permissions-Policy"[\s\S]{0,400}?value:\s*\n?\s*"([^"]+)"/);
  return m ? m[1] : "";
}

describe("Permissions-Policy", () => {
  it("is still declared at all", () => {
    // If this ever comes back empty the rest of the file is asserting nothing.
    expect(permissionsPolicy()).not.toBe("");
  });

  it("lets THIS origin use the camera", () => {
    const value = permissionsPolicy();
    const camera = /camera=\(([^)]*)\)/.exec(value)?.[1] ?? "";
    expect(
      camera.includes("self"),
      `Permissions-Policy has camera=(${camera}). An empty allowlist blocks the ` +
        `site's OWN camera, so every QR scanner fails with NotAllowedError before ` +
        `the visitor is ever asked. Use camera=(self).`,
    ).toBe(true);
  });

  it("still lets this origin locate a driver", () => {
    // The neighbouring permission, and the reason the camera omission was easy
    // to miss: geolocation was granted `self` when live tracking shipped and
    // camera was left behind.
    const value = permissionsPolicy();
    expect(/geolocation=\([^)]*self[^)]*\)/.test(value), value).toBe(true);
  });

  it("does not hand either permission to third parties", () => {
    // `self` is the point. A wildcard would let anything we embed turn the
    // camera on, which is a different and much worse bug.
    const value = permissionsPolicy();
    expect(value).not.toMatch(/camera=\([^)]*\*/);
    expect(value).not.toMatch(/geolocation=\([^)]*\*/);
  });

  it("keeps the microphone switched off", () => {
    // Nothing on this platform records audio. If that ever changes it should be
    // a deliberate edit here, not a side effect of fixing the camera.
    const value = permissionsPolicy();
    expect(value).toMatch(/microphone=\(\)/);
  });
});
