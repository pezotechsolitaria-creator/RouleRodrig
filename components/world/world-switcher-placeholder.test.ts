import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ── THE HEADER DOES NOT GROW AFTER HYDRATION (SEO audit 2026-09-29 T10) ─────
//
// The homepage's one layout shift (CLS 0.19): WorldSwitcher returned null
// until the world was read on the client, so the server header row had no
// 44px pill and grew from 59 to 65px when it arrived. It now server-renders an
// invisible box of the same min-h-11, in the caller's position. Rendered here
// in both states; `ready` is false in the server render, exactly as in the
// real one.

const world = vi.hoisted(() => ({
  value: { world: null as "authentic" | "curated" | null, ready: false, choose: () => {} },
}));
vi.mock("@/context/ExperienceWorldContext", () => ({
  useExperienceWorld: () => world.value,
}));
vi.mock("@/components/world/WorldSwitchHint", () => ({
  default: () => null,
  markWorldHintSeen: () => {},
}));

describe("WorldSwitcher before the world is known", async () => {
  const { default: WorldSwitcher } = await import("./WorldSwitcher");

  it("reserves the pill's box — invisible, silent, not focusable, where the caller put it", () => {
    world.value = { world: null, ready: false, choose: () => {} };
    const html = renderToStaticMarkup(createElement(WorldSwitcher, { strip: false, className: "mx-auto" }));
    expect(html).toMatch(/^<span [^>]*><\/span>$/);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/class="[^"]*\binvisible\b/);
    expect(html).toMatch(/class="[^"]*\bmin-h-11\b/);
    expect(html).toMatch(/class="[^"]*\bmx-auto\b/);
    // Nothing a keyboard or a screen reader can land on.
    expect(html).not.toMatch(/<button|<a |tabindex/i);
  });

  it("matches the real pill's height class once it is known", () => {
    world.value = { world: "authentic", ready: true, choose: () => {} };
    const html = renderToStaticMarkup(createElement(WorldSwitcher, { strip: false, className: "mx-auto" }));
    expect(html).toMatch(/<button[^>]*class="[^"]*\bmin-h-11\b[^"]*\bmx-auto\b/);
  });

  it("still draws no strip before a world exists", () => {
    world.value = { world: null, ready: false, choose: () => {} };
    expect(renderToStaticMarkup(createElement(WorldSwitcher, {}))).toBe("");
  });
});
