import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ── GlobalTiRoule itself, driven tap by tap (architecture review 2026-09-30) ──
//
// Perf-a11y findings on the lazy split: the first tap now downloads the chat,
// and a slow or failed download used to show nothing, so the nav button looked
// dead. lib/tiroule-launcher.test.ts drives the state machine and
// components/tiroule-load-notice.test.ts draws each state; this drives the
// component that joins them, as the layout mounts it: the real launcher, the
// real shared loader, the real "tiroule:open" event the nav button fires, and
// a guide module whose download can be held back or made to fail.
//
// There is no DOM in this suite (vitest runs in "node"), so React's three
// hooks are replaced by a small runner that keeps state, refs and effects the
// way React does: state survives renders, effects re-run when their deps
// change, and every cleanup of a commit runs before any of its effects. The
// component code under test is untouched.

const fx = vi.hoisted(() => ({
  evaluations: 0,
  failImport: false,
  gate: Promise.resolve() as Promise<void>,
}));

// The guide module, as far as the loader can tell: evaluating it is the
// download. `gate` holds it back (island data); throwing is what a chunk that
// a deploy removed looks like to import(). vitest keeps a factory's result
// across resetModules once it succeeds, so setup() registers it afresh for
// every test (vi.doMock); the hoisted vi.mock only guarantees the real
// 1,509-line guide is never evaluated here.
const guideModule = vi.hoisted(() => async () => {
  fx.evaluations += 1;
  await fx.gate;
  if (fx.failImport) throw new Error("ChunkLoadError: Loading chunk 4821 failed (404)");
  return { default: function FakeTiRouleGuide() { return null; } };
});
vi.mock("@/components/TiRouleGuide", () => guideModule());

const h = vi.hoisted(() => {
  type Cleanup = void | (() => void);
  type Deps = readonly unknown[] | undefined;
  const s = {
    pathname: "/browse/car",
    language: "en" as "en" | "fr" | "cr",
    states: [] as unknown[],
    refs: [] as { current: unknown }[],
    effects: [] as { deps: Deps; cleanup: Cleanup }[],
    queue: [] as { i: number; create: () => Cleanup; deps: Deps }[],
    at: { state: 0, ref: 0, effect: 0 },
    dirty: false,
  };
  function useState<T>(init: T | (() => T)) {
    const i = s.at.state++;
    if (!(i in s.states)) s.states[i] = typeof init === "function" ? (init as () => T)() : init;
    const set = (next: T | ((prev: T) => T)) => {
      const v = typeof next === "function" ? (next as (p: T) => T)(s.states[i] as T) : next;
      if (!Object.is(v, s.states[i])) {
        s.states[i] = v;
        s.dirty = true;
      }
    };
    return [s.states[i] as T, set] as const;
  }
  function useRef<T>(init: T) {
    const i = s.at.ref++;
    return (s.refs[i] ??= { current: init }) as { current: T };
  }
  function useEffect(create: () => Cleanup, deps?: readonly unknown[]) {
    const i = s.at.effect++;
    const prev = s.effects[i]?.deps;
    const changed =
      !prev || !deps || deps.length !== prev.length || deps.some((d, k) => !Object.is(d, prev[k]));
    if (changed) s.queue.push({ i, create, deps });
  }
  function unmount() {
    for (const e of s.effects) if (typeof e?.cleanup === "function") e.cleanup();
    s.states = [];
    s.refs = [];
    s.effects = [];
    s.queue = [];
    s.dirty = false;
  }
  return { s, useState, useRef, useEffect, unmount };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: h.useState,
  useRef: h.useRef,
  useEffect: h.useEffect,
}));
vi.mock("next/navigation", () => ({ usePathname: () => h.s.pathname }));
vi.mock("@/context/LanguageContext", () => ({ useLanguage: () => ({ language: h.s.language }) }));

type Props = Record<string, unknown>;
type Component = (p: Props) => unknown;

/** One render and its commit: every cleanup first, then every effect. */
function renderOnce(C: Component, props: Props) {
  h.s.at = { state: 0, ref: 0, effect: 0 };
  h.s.dirty = false;
  const out = C(props);
  const queue = h.s.queue;
  h.s.queue = [];
  for (const { i } of queue) {
    const c = h.s.effects[i]?.cleanup;
    if (typeof c === "function") c();
  }
  for (const { i, create, deps } of queue) h.s.effects[i] = { deps, cleanup: create() };
  return out;
}

/** Renders until no state is left pending, as React would. */
function render(C: Component, props: Props) {
  let out = renderOnce(C, props);
  for (let n = 0; h.s.dirty; n++) {
    if (n > 20) throw new Error("GlobalTiRoule kept re-rendering");
    out = renderOnce(C, props);
  }
  return out;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

const PROPS: Props = {
  image: "https://example.test/ti.png",
  data: { beaches: [], viewpoints: [] },
};

type NoticeProps = {
  status: string;
  onRetry: () => void;
  onReload: () => void;
  onDismiss: () => void;
};

async function setup(opts: { navigator?: Record<string, unknown> } = {}) {
  vi.resetModules();
  vi.doMock("@/components/TiRouleGuide", guideModule);
  const reload = vi.fn();
  const win = Object.assign(new EventTarget(), { location: { reload } });
  vi.stubGlobal("window", win);
  vi.stubGlobal("navigator", opts.navigator ?? { onLine: true });
  // Stands in for the guide's own "tiroule:open" listener, which it adds when
  // it mounts: it counts every open that reaches the page.
  const opens = vi.fn();
  win.addEventListener("tiroule:open", opens);

  const { default: GlobalTiRoule } = await import("@/components/GlobalTiRoule");
  const { default: TiRouleLoadNotice, TI_ROULE_LOAD_COPY } = await import(
    "@/components/TiRouleLoadNotice"
  );
  const { openTiRoule } = await import("@/lib/nav-tabs");
  const C = GlobalTiRoule as unknown as Component;
  const view = () => render(C, PROPS);

  /** The notice GlobalTiRoule returned, or null when it returned anything else. */
  const notice = (out: unknown) =>
    isValidElement(out) && out.type === TiRouleLoadNotice
      ? (out as ReactElement<NoticeProps>)
      : null;
  const guide = (out: unknown) =>
    isValidElement(out) && (out.type as { name?: string }).name === "FakeTiRouleGuide"
      ? (out as ReactElement<{ hideFab?: boolean; image?: string }>)
      : null;
  const html = (out: unknown) =>
    isValidElement(out) ? renderToStaticMarkup(out as ReactElement) : "";

  return { win, reload, opens, view, openTiRoule, notice, guide, html, copy: TI_ROULE_LOAD_COPY };
}

/** Copy as React prints it ("You're" comes out as "You&#x27;re"). */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  fx.evaluations = 0;
  fx.failImport = false;
  fx.gate = Promise.resolve();
  h.s.pathname = "/browse/car";
  h.s.language = "en";
});
afterEach(() => {
  h.unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  consoleError.mockRestore();
});

describe("a tap while the chat is still downloading", () => {
  it("Data Saver, first touch: 'Opening Ti Roulé…' after 300ms, then the chat opens in its place", async () => {
    // Data Saver skips the early fetch, so for these visitors every first
    // open is a cold download — the case where the button looked dead.
    const t = await setup({ navigator: { onLine: true, connection: { saveData: true } } });
    const held = deferred();
    fx.gate = held.promise;

    expect(t.html(t.view())).toBe("");
    t.win.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(fx.evaluations).toBe(0);

    t.openTiRoule();
    await vi.advanceTimersByTimeAsync(299);
    let out = t.view();
    // Asked, not slow yet: an empty live region and nothing to see.
    expect(t.notice(out)?.props.status).toBe("waiting");
    expect(t.html(out)).not.toContain(t.copy.en.loading);

    await vi.advanceTimersByTimeAsync(1);
    out = t.view();
    expect(t.notice(out)?.props.status).toBe("loading");
    expect(t.html(out)).toContain(`role="status"`);
    expect(t.html(out)).toContain(esc(t.copy.en.loading));
    expect(t.opens).toHaveBeenCalledTimes(1);

    held.resolve();
    await vi.waitFor(() => expect(t.guide(t.view())).not.toBeNull());
    out = t.view();
    expect(t.guide(out)?.props.hideFab).toBe(true);
    expect(t.guide(out)?.props.image).toBe(PROPS.image);
    // The pill is gone with the download, and the open the visitor asked for
    // is sent once more, now that the guide's own listener is there to act.
    expect(t.notice(out)).toBeNull();
    expect(t.opens).toHaveBeenCalledTimes(2);

    // From here the guide answers every tap itself: no second download, and
    // nothing of the launcher left listening.
    t.openTiRoule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.guide(t.view())).not.toBeNull();
    expect(fx.evaluations).toBe(1);
  });
});

describe("a tap whose download fails", () => {
  it("online (a tab older than the last deploy): says so in French, and reloads only on the press", async () => {
    h.s.language = "fr";
    const t = await setup();
    fx.failImport = true;
    t.view();

    t.openTiRoule();
    let out: unknown;
    await vi.waitFor(() => {
      out = t.view();
      expect(t.notice(out)?.props.status).toBe("failed");
    });
    expect(t.html(out)).toContain(esc(t.copy.fr.failed));
    expect(t.html(out)).toContain(`>${t.copy.fr.reload}</button>`);
    expect(consoleError).toHaveBeenCalledTimes(1);
    // Never automatic: a reload would throw away a half-typed booking form.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.reload).not.toHaveBeenCalled();

    t.notice(t.view())!.props.onReload();
    expect(t.reload).toHaveBeenCalledTimes(1);
  });

  it("offline: says so, and Try again downloads again and opens the chat", async () => {
    const nav = { onLine: false };
    const t = await setup({ navigator: nav });
    fx.failImport = true;
    t.view();

    t.openTiRoule();
    let out: unknown;
    await vi.waitFor(() => {
      out = t.view();
      expect(t.notice(out)?.props.status).toBe("offline");
    });
    expect(t.html(out)).toContain(esc(t.copy.en.offline));
    expect(t.html(out)).toContain(">Try again</button>");
    expect(t.html(out)).not.toContain(t.copy.en.reload);

    // Back online; the visitor presses Try again.
    nav.onLine = true;
    fx.failImport = false;
    t.notice(t.view())!.props.onRetry();
    // It answers at once: the person is looking at the pill.
    expect(t.notice(t.view())?.props.status).toBe("loading");
    await vi.waitFor(() => expect(t.guide(t.view())).not.toBeNull());
    expect(fx.evaluations).toBe(2);
    expect(t.reload).not.toHaveBeenCalled();
  });

  it("the notice can be dismissed, goes when the visitor changes page, and the next tap tries again", async () => {
    const t = await setup();
    fx.failImport = true;
    t.view();

    t.openTiRoule();
    await vi.waitFor(() => expect(t.notice(t.view())?.props.status).toBe("failed"));
    t.notice(t.view())!.props.onDismiss();
    expect(t.html(t.view())).toBe("");

    t.openTiRoule();
    await vi.waitFor(() => expect(t.notice(t.view())?.props.status).toBe("failed"));
    h.s.pathname = "/browse/scooter";
    expect(t.html(t.view())).toBe("");

    fx.failImport = false;
    t.openTiRoule();
    await vi.waitFor(() => expect(t.guide(t.view())).not.toBeNull());
    expect(fx.evaluations).toBe(3);
  });
});

describe("where Ti Roulé does not open at all", () => {
  it("on a console page, or with no mascot picture, a tap downloads nothing and shows nothing", async () => {
    h.s.pathname = "/driver";
    const t = await setup();
    expect(t.view()).toBeNull();
    t.openTiRoule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.view()).toBeNull();
    expect(fx.evaluations).toBe(0);

    h.unmount();
    h.s.pathname = "/browse/car";
    const C = (await import("@/components/GlobalTiRoule")).default as unknown as Component;
    expect(render(C, { data: PROPS.data })).toBeNull();
    t.openTiRoule();
    await vi.advanceTimersByTimeAsync(1000);
    expect(render(C, { data: PROPS.data })).toBeNull();
    expect(fx.evaluations).toBe(0);
  });
});
