import { describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { staticGraph } from "@/test/import-graph";

// ── Skip link and the /experiences landmark (architecture review 2026-09-30) ──
//
// A11y item 3. The site had no skip link and /experiences had no <main>, so a
// keyboard user tabbed through every header control on every page and a
// screen reader's "jump to main" found nothing on the experiences hub. These
// render the real components; e2e/a11y-smoke.spec.ts drives the link with a
// real keyboard in a browser, which is the part a Node test cannot do.

const lang = vi.hoisted(() => ({ language: "en" as "en" | "fr" | "cr" }));

vi.mock("@/context/LanguageContext", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/context/LanguageContext")>()),
  useLanguage: () => ({ language: lang.language, t: {} as never }),
}));
vi.mock("next/link", () => ({
  default: (p: { href: string; children?: ReactNode; className?: string }) =>
    createElement("a", { href: p.href, className: p.className }, p.children),
}));
vi.mock("next/image", () => ({ default: () => null }));

describe("the skip link", () => {
  it("is mounted by the root layout", () => {
    expect(staticGraph("app/layout.tsx").has("components/SkipLink.tsx")).toBe(true);
  });

  it("points at the main-content target and speaks the visitor's language", async () => {
    const { default: SkipLink, SKIP_TARGET_ID } = await import("@/components/SkipLink");
    const html = (l: typeof lang.language) => {
      lang.language = l;
      return renderToStaticMarkup(createElement(SkipLink));
    };
    expect(html("en")).toContain(`href="#${SKIP_TARGET_ID}"`);
    expect(html("en")).toContain(">Skip to content</a>");
    expect(html("fr")).toContain(">Aller au contenu</a>");
    expect(html("cr")).toContain(">Al direk lor paz</a>");
    // Hidden above the viewport until focused, then brought down, 44px tall.
    const cls = /class="([^"]*)"/.exec(html("en"))![1].split(" ");
    expect(cls).toEqual(expect.arrayContaining(["fixed", "-translate-y-full", "focus:translate-y-4", "min-h-11"]));
  });

  it("targets the marked element first, else the page's first <main>", async () => {
    const { skipTarget } = await import("@/components/SkipLink");
    const marked = { tag: "marked" };
    const main = { tag: "main" };
    const doc = (byId: unknown, first: unknown) =>
      ({ getElementById: () => byId, querySelector: (s: string) => (s === "main" ? first : null) }) as never;
    expect(skipTarget(doc(marked, main))).toBe(marked);
    expect(skipTarget(doc(null, main))).toBe(main);
    expect(skipTarget(doc(null, null))).toBeNull();
  });

  it("focuses the landmark, then leaves it as it found it", async () => {
    const { focusSkipTarget } = await import("@/components/SkipLink");
    const fake = (tabindex?: string) => {
      const attrs = new Map<string, string>(tabindex ? [["tabindex", tabindex]] : []);
      const events = new EventTarget();
      return {
        attrs,
        style: { outline: "" },
        focus: vi.fn(),
        hasAttribute: (n: string) => attrs.has(n),
        setAttribute: (n: string, v: string) => void attrs.set(n, v),
        removeAttribute: (n: string) => void attrs.delete(n),
        addEventListener: events.addEventListener.bind(events),
        blur: () => events.dispatchEvent(new Event("blur")),
      };
    };

    const main = fake();
    focusSkipTarget(main as never);
    expect(main.focus).toHaveBeenCalledTimes(1);
    expect(main.attrs.get("tabindex")).toBe("-1");
    expect(main.style.outline).toBe("none");
    main.blur();
    // Not left focusable: a stray click would otherwise focus the whole page.
    expect(main.attrs.has("tabindex")).toBe(false);
    expect(main.style.outline).toBe("");

    // A target that was already focusable keeps its own tabindex.
    const own = fake("0");
    focusSkipTarget(own as never);
    own.blur();
    expect(own.attrs.get("tabindex")).toBe("0");
  });
});

describe("/experiences has a main landmark", () => {
  it("the hub renders inside <main id=main-content>, once", async () => {
    lang.language = "en";
    const { default: ExperiencesHub } = await import("@/components/experiences/ExperiencesHub");
    const html = renderToStaticMarkup(createElement(ExperiencesHub, { places: [] }));
    expect(html.startsWith('<main id="main-content"')).toBe(true);
    expect(html.match(/<main\b/g)).toHaveLength(1);
    expect(html.trimEnd().endsWith("</main>")).toBe(true);
  });
});
