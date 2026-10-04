import { describe, expect, it } from "vitest";
import { createElement, isValidElement, type ReactElement } from "react";
import ResetPasswordLayout, { metadata } from "./layout";

// ── /auth/reset-password ASKS NOT TO BE INDEXED (architecture review
// 2026-09-30, item 7) ────────────────────────────────────────────────────────
// The page is a Client Component with no metadata of its own, so it served the
// homepage's title and no robots directive. Its layout now carries both.

describe("/auth/reset-password metadata", () => {
  it("is noindex, nofollow", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it("has a title of its own: the heading the page shows, not the homepage's", () => {
    expect(metadata.title).toBe("Choose a new password | Roule Rodrigues");
    // The root layout's titles all lead with the brand ("Roule Rodrigues |
    // Scooter & Car Rental, …"); this one leads with what the screen is.
    expect(String(metadata.title)).not.toMatch(/^Roule Rodrigues/);
    expect(metadata.description).toBeTruthy();
  });

  it("names the bare path as canonical, never a token-bearing link", () => {
    expect(String(metadata.alternates?.canonical)).toMatch(/\/auth\/reset-password$/);
  });

  it("renders the page it wraps, and nothing else", () => {
    const child = createElement("main", null, "form");
    const out = ResetPasswordLayout({ children: child }) as ReactElement;
    expect(isValidElement(out)).toBe(true);
    expect(out).toBe(child);
  });
});
