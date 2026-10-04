import { describe, expect, it, vi } from "vitest";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TiRouleLoadNotice, { TI_ROULE_LOAD_COPY } from "@/components/TiRouleLoadNotice";
import type { TiRouleLoadStatus } from "@/lib/tiroule-launcher";
import { translations, type Language } from "@/lib/i18n";

// ── What a Ti Roulé tap shows before the chat arrives (architecture review
// 2026-09-30, perf-a11y findings) ──
//
// The launcher's statuses (lib/tiroule-launcher.test.ts) are only half of the
// fix; these render the notice GlobalTiRoule draws from them, in all three
// languages, and press its real buttons.

type Handlers = { onRetry: () => void; onReload: () => void; onDismiss: () => void };

function props(status: TiRouleLoadStatus, lang: Language = "en") {
  const h: Handlers = { onRetry: vi.fn(), onReload: vi.fn(), onDismiss: vi.fn() };
  return { status, lang, ...h };
}

const html = (status: TiRouleLoadStatus, lang: Language = "en") =>
  renderToStaticMarkup(createElement(TiRouleLoadNotice, props(status, lang)));

/** Copy as React prints it ("You're" comes out as "You&#x27;re"). */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** The <button> elements of the tree the component returns, props intact. */
function buttons(node: ReactNode): ReactElement<{ onClick: () => void; children?: ReactNode; "aria-label"?: string }>[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ children?: ReactNode; onClick: () => void }>;
  return [...(el.type === "button" ? [el] : []), ...buttons(el.props.children)];
}

describe("the notice, by status", () => {
  it("idle prints nothing, so the page is untouched until somebody asks", () => {
    expect(html("idle")).toBe("");
  });

  it("waiting mounts an empty live region and nothing visible", () => {
    const out = html("waiting");
    expect(out).toMatch(/<p role="status" aria-live="polite"[^>]*><\/p>/);
    expect(out).not.toContain("<button");
    expect(out).not.toContain("bg-dark/90");
    // Click-through: an invisible box must not swallow a tap on the page.
    expect(out).toContain("pointer-events-none");
    expect(out).not.toContain("pointer-events-auto");
  });

  it("loading says so, in the live region, with no buttons", () => {
    const out = html("loading");
    expect(out).toContain(">Opening Ti Roulé…</p>");
    expect(out).toContain('role="status"');
    expect(out).not.toContain("<button");
  });

  it("offline explains it and offers Try again, never a reload", () => {
    const out = html("offline");
    expect(out).toContain(esc(TI_ROULE_LOAD_COPY.en.offline));
    expect(out).toContain(">Try again</button>");
    expect(out).not.toContain("Reload page");
    expect(out).toContain('aria-label="Dismiss"');
  });

  it("failed offers Reload page, which only the visitor triggers", () => {
    const out = html("failed");
    expect(out).toContain(esc(TI_ROULE_LOAD_COPY.en.failed));
    expect(out).toContain(">Reload page</button>");
    expect(out).not.toContain(">Try again</button>");
    expect(out).toContain('aria-label="Dismiss"');
  });

  it("every control is at least 44px tall", () => {
    for (const status of ["offline", "failed"] as const) {
      const tags = html(status).match(/<button[^>]*>/g) ?? [];
      expect(tags.length).toBe(2);
      for (const tag of tags) expect(tag).toMatch(/\b(min-h-11|h-11)\b/);
    }
  });
});

describe("the notice, by language", () => {
  const langs: Language[] = ["en", "fr", "cr"];

  it("speaks EN, FR and Kreol, with the shared words for Try again and Dismiss", () => {
    for (const lang of langs) {
      const copy = TI_ROULE_LOAD_COPY[lang];
      const common = translations[lang].common;
      expect(html("loading", lang)).toContain(esc(copy.loading));
      expect(html("offline", lang)).toContain(esc(copy.offline));
      expect(html("offline", lang)).toContain(`>${esc(common.tryAgain)}</button>`);
      expect(html("failed", lang)).toContain(esc(copy.failed));
      expect(html("failed", lang)).toContain(`>${esc(copy.reload)}</button>`);
      expect(html("failed", lang)).toContain(`aria-label="${esc(common.dismiss)}"`);
    }
  });

  it("no language reuses another's sentence", () => {
    for (const key of ["loading", "offline", "failed", "reload"] as const) {
      const seen = new Set(langs.map((l) => TI_ROULE_LOAD_COPY[l][key]));
      expect(seen.size, key).toBe(3);
    }
  });
});

describe("the buttons do what they say", () => {
  it("offline: Try again retries, the cross dismisses, nothing reloads", () => {
    const p = props("offline");
    const [retry, dismiss] = buttons(TiRouleLoadNotice(p));
    retry.props.onClick();
    dismiss.props.onClick();
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
    expect(p.onReload).not.toHaveBeenCalled();
  });

  it("failed: Reload page reloads, the cross dismisses", () => {
    const p = props("failed", "fr");
    const [reload, dismiss] = buttons(TiRouleLoadNotice(p));
    expect(reload.props.children).toBe("Recharger la page");
    reload.props.onClick();
    dismiss.props.onClick();
    expect(p.onReload).toHaveBeenCalledTimes(1);
    expect(p.onDismiss).toHaveBeenCalledTimes(1);
    expect(p.onRetry).not.toHaveBeenCalled();
  });
});
