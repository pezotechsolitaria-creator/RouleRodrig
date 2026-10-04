import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CONTENT_CONFLICT_MESSAGE,
  interpretSaveResponse,
} from "@/lib/admin/content-version";
import SaveProblemBanner from "./SaveProblemBanner";

// ── WHAT THE OWNER READS WHEN A SAVE FAILS (architecture review 2026-09-30,
// item 4) ───────────────────────────────────────────────────────────────────
//
// The studio's Save did `if (!res.ok) throw new Error()` and flashed "Error"
// for three seconds, discarding the reason the server had already written.
// interpretSaveResponse() is what the studio now runs on every answer, and the
// banner is what it renders; both are exercised here.

const text = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("interpretSaveResponse", () => {
  it("takes the new version from a successful save", () => {
    expect(interpretSaveResponse(200, { success: true, updatedAt: "2026-09-30T10:00:00+00:00" })).toEqual({
      kind: "saved",
      version: "2026-09-30T10:00:00+00:00",
    });
  });

  it("keeps the guard's own sentence on a 422", () => {
    const r = interpretSaveResponse(422, {
      error: 'Refused: FAQ questions ("faq.items") would drop from 12 to 0 items in one save.',
    });
    expect(r).toEqual({ kind: "refused", message: expect.stringContaining("would drop from 12 to 0") });
  });

  it("keeps the 503's reason, not a bare Error", () => {
    const r = interpretSaveResponse(503, { error: "Could not read the current content, so the save was refused." });
    expect(r.kind === "refused" && r.message).toMatch(/Could not read the current content/);
  });

  it("names a conflict, with the owner's sentence even if the body was lost", () => {
    expect(interpretSaveResponse(409, { error: CONTENT_CONFLICT_MESSAGE })).toEqual({
      kind: "conflict",
      message: CONTENT_CONFLICT_MESSAGE,
    });
    expect(interpretSaveResponse(409, null)).toEqual({ kind: "conflict", message: CONTENT_CONFLICT_MESSAGE });
  });

  it("says there was no reason rather than inventing one", () => {
    const r = interpretSaveResponse(502, null);
    expect(r.kind === "refused" && r.message).toBe(
      "The save failed (error 502) and the server gave no reason. Nothing was changed.",
    );
  });

  it("sends an expired session to sign in", () => {
    expect(interpretSaveResponse(401, { error: "Unauthorized" })).toEqual({ kind: "expired" });
  });
});

describe("the banner", () => {
  const noop = () => {};

  it("shows a conflict with its sentence and a reload, and says edits here are lost", () => {
    const t = text(
      createElement(SaveProblemBanner, {
        problem: { kind: "conflict", message: CONTENT_CONFLICT_MESSAGE },
        onReload: noop,
        onDismiss: noop,
      }),
    );
    expect(t).toContain("Not saved");
    expect(t).toContain("Someone saved in another tab — reload before saving.");
    expect(t).toContain("Reload the studio");
    expect(t).toContain("will be lost");
  });

  it("shows a refusal's reason with no reload button", () => {
    const markup = renderToStaticMarkup(
      createElement(SaveProblemBanner, {
        problem: { kind: "refused", message: "Refused: vehicles (\"fleet\") would drop from 12 to 0 items in one save." },
        onReload: noop,
        onDismiss: noop,
      }),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("would drop from 12 to 0");
    expect(markup).not.toContain("Reload the studio");
  });
});
