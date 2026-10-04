import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { clientGraph, staticGraph, staticSpecifiers } from "@/test/import-graph";

// ── Ti Roulé is not in the first download (architecture review 2026-09-30) ──
//
// Perf item 1. The root layout imported the 1,509-line chat guide statically,
// so every page shipped it. These tests hold the split in place from both
// sides: what app/layout.tsx statically puts in the browser bundle must not
// include the guide or the modules only it uses, and at runtime importing and
// rendering the layout's GlobalTiRoule must not evaluate the guide module at
// all — it is evaluated only when something asks for Ti Roulé.
//
// "In the browser bundle", not "anywhere in the import graph": the layout is a
// server component, and its meta description reads lib/llms-txt, which reads
// the knowledge base — on the server, where it costs a visitor nothing.

const fx = vi.hoisted(() => ({ guideEvaluations: 0 }));

// Stands in for the real guide so that the moment its MODULE is evaluated is
// observable. The factory runs when the module is first imported, and only
// then.
vi.mock("@/components/TiRouleGuide", () => {
  fx.guideEvaluations += 1;
  return { default: function FakeTiRouleGuide() { return null; } };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/browse/car" }));

const HEAVY = [
  "components/TiRouleGuide.tsx",
  "lib/rodrigues-knowledge.ts",
  "lib/currency-convert.ts",
  "lib/speak.ts",
];

describe("what the layout ships to the browser", () => {
  const shipped = clientGraph("app/layout.tsx");

  it("is really being walked (a broken walker would pass everything below)", () => {
    expect(shipped.has("components/GlobalTiRoule.tsx")).toBe(true);
    expect(shipped.has("lib/tiroule-lazy.ts")).toBe(true);
    expect(shipped.has("context/LanguageContext.tsx")).toBe(true);
    expect(shipped.size).toBeGreaterThan(40);
    // The server half is walked too, and kept out: the content reader runs
    // in the layout on the server and is not in the bundle.
    expect(staticGraph("app/layout.tsx").has("lib/content.ts")).toBe(true);
    expect(shipped.has("lib/content.ts")).toBe(false);
  });

  it("does not include the chat guide or anything only the guide uses", () => {
    expect(HEAVY.filter((f) => shipped.has(f))).toEqual([]);
  });

  it("the walker follows static imports and nothing else", () => {
    const src = [
      'import A from "@/a";',
      'import { b, type C } from "@/b";',
      'import type D from "@/d";',
      'import { type E } from "@/e";',
      'import "@/f";',
      'export { g } from "@/g";',
      'const h = () => import("@/h");',
      '// import I from "@/i";',
      '/* import J from "@/j"; */',
    ].join("\n");
    expect(staticSpecifiers(src).sort()).toEqual(["@/a", "@/b", "@/f", "@/g"]);
  });
});

describe("GlobalTiRoule at runtime", () => {
  const props = { image: "https://example.test/ti.png", data: { beaches: [], viewpoints: [] } };

  it("importing and server-rendering it leaves the guide unevaluated, and prints nothing", async () => {
    const { default: GlobalTiRoule } = await import("@/components/GlobalTiRoule");
    const html = renderToStaticMarkup(createElement(GlobalTiRoule, props));
    // Nothing before the first open — as the guide itself printed with
    // hideFab — so there is no box to appear or move when it loads.
    expect(html).toBe("");
    expect(fx.guideEvaluations).toBe(0);
  });

  it("loads the guide on request, once, however many launchers ask", async () => {
    const { loadTiRouleGuide, loadedTiRouleGuide } = await import("@/lib/tiroule-lazy");
    expect(loadedTiRouleGuide()).toBeNull();
    const [a, b] = await Promise.all([loadTiRouleGuide(), loadTiRouleGuide()]);
    expect(a).toBe(b);
    expect(a.name).toBe("FakeTiRouleGuide");
    expect(loadedTiRouleGuide()).toBe(a);
    expect(await loadTiRouleGuide()).toBe(a);
    expect(fx.guideEvaluations).toBe(1);
  });
});

describe("the listener hears every launcher", () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  });

  it("catches exactly the event the nav button dispatches, until cleaned up", async () => {
    const win = new EventTarget();
    (globalThis as { window?: unknown }).window = win;
    const { openTiRoule } = await import("@/lib/nav-tabs");
    const { listenForTiRouleOpen } = await import("@/lib/tiroule-lazy");

    const onOpen = vi.fn();
    const off = listenForTiRouleOpen(win, onOpen);
    openTiRoule();
    // The hero, the blog button and the world cards dispatch the literal.
    win.dispatchEvent(new CustomEvent("tiroule:open"));
    expect(onOpen).toHaveBeenCalledTimes(2);

    off();
    openTiRoule();
    expect(onOpen).toHaveBeenCalledTimes(2);
  });
});

describe("warming after the first interaction", () => {
  it("waits for a tap or key, then schedules one idle load", async () => {
    const { warmAfterFirstInteraction } = await import("@/lib/tiroule-lazy");
    const target = new EventTarget();
    const warm = vi.fn();
    const schedule = vi.fn((fn: () => void) => fn());

    warmAfterFirstInteraction(target, warm, { schedule });
    // Nothing during the page's own load — that is the cost being removed.
    expect(schedule).not.toHaveBeenCalled();

    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("pointerdown"));
    target.dispatchEvent(new Event("keydown"));
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it("never warms under Data Saver, or once cleaned up", async () => {
    const { warmAfterFirstInteraction } = await import("@/lib/tiroule-lazy");
    const target = new EventTarget();
    const warm = vi.fn();
    const schedule = vi.fn((fn: () => void) => fn());

    warmAfterFirstInteraction(target, warm, { saveData: true, schedule });
    target.dispatchEvent(new Event("keydown"));

    const off = warmAfterFirstInteraction(target, warm, { schedule });
    off();
    target.dispatchEvent(new Event("pointerdown"));

    expect(warm).not.toHaveBeenCalled();
  });
});
