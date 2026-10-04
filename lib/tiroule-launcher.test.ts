import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TiRouleGuideComponent } from "@/lib/tiroule-lazy";
import type { TiRouleLoadStatus } from "@/lib/tiroule-launcher";

// ── A tap on Ti Roulé always gets an answer (architecture review 2026-09-30) ──
//
// Perf-a11y findings: after the lazy split, a slow first download showed
// nothing and a failed one only wrote console.error, so the nav button looked
// dead. These drive the launcher GlobalTiRoule starts, through the real
// "tiroule:open" event the nav button fires (lib/nav-tabs openTiRoule), the
// real timers (faked) and, at the end, the real shared loader.

const fx = vi.hoisted(() => ({ failImport: false, evaluations: 0 }));

// The real guide module, as far as the loader can tell: evaluating it is the
// download. Throwing here is what a missing chunk looks like to import().
vi.mock("@/components/TiRouleGuide", () => {
  fx.evaluations += 1;
  if (fx.failImport) throw new Error("ChunkLoadError: Loading chunk 4821 failed (404)");
  return { default: function FakeTiRouleGuide() { return null; } };
});

const Guide = function Guide() { return null; } as unknown as TiRouleGuideComponent;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function setup(over: {
  load?: () => Promise<TiRouleGuideComponent>;
  loaded?: () => TiRouleGuideComponent | null;
  offline?: boolean;
  saveData?: boolean;
} = {}) {
  const win = new EventTarget();
  (globalThis as { window?: unknown }).window = win;
  const { openTiRoule } = await import("@/lib/nav-tabs");
  const { startTiRouleLauncher } = await import("@/lib/tiroule-launcher");
  const statuses: TiRouleLoadStatus[] = [];
  const onReady = vi.fn();
  const launcher = startTiRouleLauncher(win, {
    onReady,
    onStatus: (s) => statuses.push(s),
    isOffline: () => !!over.offline,
    saveData: over.saveData,
    load: over.load,
    loaded: over.loaded ?? (() => null),
    schedule: (fn) => fn(),
  });
  return { win, openTiRoule, launcher, statuses, onReady };
}

const realWindow = (globalThis as { window?: unknown }).window;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  consoleError.mockRestore();
  (globalThis as { window?: unknown }).window = realWindow;
});

describe("while the chat downloads", () => {
  it("a quick load opens without ever flashing the pill", async () => {
    const d = deferred<TiRouleGuideComponent>();
    const { openTiRoule, statuses, onReady } = await setup({ load: () => d.promise });

    openTiRoule();
    // Asked: the empty live region goes in now, so later text is announced.
    expect(statuses).toEqual(["waiting"]);
    await vi.advanceTimersByTimeAsync(120);
    d.resolve(Guide);
    await vi.advanceTimersByTimeAsync(1000);

    expect(statuses).toEqual(["waiting", "idle"]);
    expect(onReady).toHaveBeenCalledExactlyOnceWith(Guide);
  });

  it("a slow load says 'Opening' after 300ms, then gives way to the chat", async () => {
    const d = deferred<TiRouleGuideComponent>();
    const { openTiRoule, statuses, onReady } = await setup({ load: () => d.promise });

    openTiRoule();
    await vi.advanceTimersByTimeAsync(299);
    expect(statuses).toEqual(["waiting"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(statuses).toEqual(["waiting", "loading"]);
    expect(onReady).not.toHaveBeenCalled();

    d.resolve(Guide);
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toEqual(["waiting", "loading", "idle"]);
    expect(onReady).toHaveBeenCalledExactlyOnceWith(Guide);
  });

  it("every tap during one download shares it, and the chat opens once", async () => {
    const d = deferred<TiRouleGuideComponent>();
    const load = vi.fn(() => d.promise);
    const { win, openTiRoule, onReady } = await setup({ load });

    openTiRoule();
    win.dispatchEvent(new CustomEvent("tiroule:open"));
    openTiRoule();
    d.resolve(Guide);
    await vi.advanceTimersByTimeAsync(0);

    expect(load).toHaveBeenCalledTimes(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it("a guide already warmed opens on the tap itself, with no status at all", async () => {
    const load = vi.fn(() => Promise.resolve(Guide));
    const { openTiRoule, statuses, onReady } = await setup({ load, loaded: () => Guide });

    openTiRoule();
    expect(onReady).toHaveBeenCalledExactlyOnceWith(Guide);
    expect(statuses).toEqual([]);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("when the download fails", () => {
  it("online: says so and offers a reload, instead of only console.error", async () => {
    const { openTiRoule, statuses, onReady } = await setup({
      load: () => Promise.reject(new Error("ChunkLoadError")),
    });

    openTiRoule();
    await vi.advanceTimersByTimeAsync(0);

    expect(statuses).toEqual(["waiting", "failed"]);
    expect(onReady).not.toHaveBeenCalled();
    // Still logged for whoever is debugging, just no longer the only trace.
    expect(consoleError).toHaveBeenCalledTimes(1);
    // The status settles; no 300ms timer fires "loading" over the failure.
    await vi.advanceTimersByTimeAsync(5000);
    expect(statuses.at(-1)).toBe("failed");
  });

  it("offline: says so, and Try again (the same event) answers at once", async () => {
    let fail = true;
    const d = deferred<TiRouleGuideComponent>();
    const load = vi.fn(() => (fail ? Promise.reject(new Error("offline")) : d.promise));
    const { openTiRoule, statuses, onReady } = await setup({ load, offline: true });

    openTiRoule();
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses).toEqual(["waiting", "offline"]);

    // Back online; the notice's Try again calls openTiRoule().
    fail = false;
    openTiRoule();
    // No 300ms gap where the notice vanishes: the person is watching it.
    expect(statuses).toEqual(["waiting", "offline", "loading"]);

    d.resolve(Guide);
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("idle");
    expect(onReady).toHaveBeenCalledExactlyOnceWith(Guide);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("dismiss clears a failure, but never a download that is still coming", async () => {
    const slow = deferred<TiRouleGuideComponent>();
    const { openTiRoule, launcher, statuses } = await setup({ load: () => slow.promise });

    openTiRoule();
    await vi.advanceTimersByTimeAsync(300);
    launcher.dismiss();
    expect(statuses).toEqual(["waiting", "loading"]);

    slow.reject(new Error("ChunkLoadError"));
    await vi.advanceTimersByTimeAsync(0);
    expect(statuses.at(-1)).toBe("failed");
    launcher.dismiss();
    expect(statuses.at(-1)).toBe("idle");
  });
});

describe("the early, unasked-for fetch", () => {
  it("fails silently: nobody tapped, so there is nobody to tell", async () => {
    const load = vi.fn(() => Promise.reject(new Error("offline")));
    const { win, statuses } = await setup({ load });

    win.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);

    expect(load).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("is skipped under Data Saver, where the tap is the only download", async () => {
    const load = vi.fn(() => Promise.resolve(Guide));
    const { win } = await setup({ load, saveData: true });

    win.dispatchEvent(new Event("pointerdown"));
    win.dispatchEvent(new Event("keydown"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).not.toHaveBeenCalled();
  });
});

describe("stopping (the guide mounted, or the page became a console)", () => {
  it("stops listening, drops a late result and clears the pill", async () => {
    const d = deferred<TiRouleGuideComponent>();
    const load = vi.fn(() => d.promise);
    const { openTiRoule, launcher, statuses, onReady } = await setup({ load });

    openTiRoule();
    await vi.advanceTimersByTimeAsync(300);
    launcher.stop();
    expect(statuses.at(-1)).toBe("idle");

    d.resolve(Guide);
    await vi.advanceTimersByTimeAsync(0);
    openTiRoule();
    expect(onReady).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("with the real shared loader", () => {
  it("a missing chunk shows the notice; the next tap retries the import and opens", async () => {
    vi.resetModules();
    fx.failImport = true;
    fx.evaluations = 0;
    // No `load`/`loaded` seams: this is what GlobalTiRoule runs.
    const win = new EventTarget();
    (globalThis as { window?: unknown }).window = win;
    const { openTiRoule } = await import("@/lib/nav-tabs");
    const { startTiRouleLauncher } = await import("@/lib/tiroule-launcher");
    const statuses: TiRouleLoadStatus[] = [];
    const onReady = vi.fn();
    startTiRouleLauncher(win, {
      onReady,
      onStatus: (s) => statuses.push(s),
      isOffline: () => false,
      saveData: true,
    });

    openTiRoule();
    await vi.waitFor(() => expect(statuses.at(-1)).toBe("failed"));
    expect(onReady).not.toHaveBeenCalled();

    fx.failImport = false;
    openTiRoule();
    expect(statuses.at(-1)).toBe("loading");
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect((onReady.mock.calls[0][0] as { name: string }).name).toBe("FakeTiRouleGuide");
    expect(statuses.at(-1)).toBe("idle");
    expect(fx.evaluations).toBe(2);
  });
});
