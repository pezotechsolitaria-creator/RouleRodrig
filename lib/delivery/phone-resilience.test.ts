import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

// ── SIX MORE WAYS THE JOURNEY STOPPED ON A PHONE ────────────────────────────
// None of these threw. Each one either destroyed work, or left somebody
// looking at nothing with no way to tell a slow connection from a broken app.

describe("a deploy must not wipe the form you are filling", () => {
  const src = read("components/PWARegister.tsx");

  it("the reload waits until the page is hidden", () => {
    // registration.update() runs on every visibilitychange and sw.js calls
    // skipWaiting(), so backgrounding the phone to look up an address — the
    // normal way a form gets filled — reloaded the page. /deliver survives on
    // its keystroke draft; /deliver/[id] loses an open payment sheet, a typed
    // reference and a chosen photo.
    expect(src).toMatch(/const reloadWhenUnwatched = \(\) =>/);
    expect(src).toMatch(/document\.visibilityState === "hidden"/);
  });

  it("and it still cannot loop", () => {
    expect(src).toMatch(/if \(reloading\) return;/);
  });

  it("the deferred listener is unhooked on unmount", () => {
    expect(src).toMatch(/pendingReload\.current\?\.\(\)/);
  });
});

describe("the map says something when it cannot load", () => {
  it("the chunk has a loading state", () => {
    // No `loading:` meant tapping "pin on map" showed NOTHING while a
    // Leaflet-sized chunk crossed 3G — on the branch serving the 182
    // localities with no gazetteer entry, i.e. people who cannot type it.
    const src = read("components/PlacePicker.tsx");
    expect(src).toMatch(/loading: \(\) => \(/);
  });

  it("a failed import is caught, in both maps", () => {
    // A rejected promise in an effect is an unhandled rejection — a React
    // error boundary never sees it — so the sheet sat blank for ever.
    expect(read("components/PinOnMap.tsx")).toMatch(/\.catch\(\(\) => \{/);
    expect(read("components/tracking/TrackingMap.tsx")).toMatch(
      /leaflet chunk failed to load/,
    );
  });

  it("and the pin sheet explains it", () => {
    const src = read("components/PinOnMap.tsx");
    expect(src).toContain("chunkFailed");
    expect(src).toContain("The map could not load");
  });
});

describe("a blocked popup is not silence", () => {
  it("both document links notice", () => {
    // Opened after two awaits, so the gesture is long gone and every mobile
    // browser blocks it — returning null and saying nothing. The driver at the
    // door taps "View ID" and NOTHING happens.
    const src = read("app/driver/DriverDashboard.tsx");
    expect(src).toMatch(/function openSigned/);
    expect(src.match(/openSigned\(json\.url, setError\)/g) ?? []).toHaveLength(2);
    expect(src).not.toMatch(/window\.open\(json\.url/);
  });
});

describe("going on duty either saves or says so", () => {
  const src = read("app/d/[token]/DriverHome.tsx");

  it("the response is checked", () => {
    // No catch and no r.ok, called as void: the toggle slid, the spinner
    // cleared, and the driver sat "available" while the server had them off —
    // invisible to dispatch, wondering why no work came.
    expect(src).toMatch(/if \(!r\.ok\) \{/);
    expect(src).toMatch(/setToggleError/);
  });

  it("and it says which way round they actually are", () => {
    expect(src).toMatch(/You are still/);
  });
});

describe("the online listener can be removed", () => {
  it("it is removed by the reference it was added with", () => {
    // An anonymous arrow added, `sync` removed. The effect depends on the
    // language copy, so every language tap leaked another listener.
    const src = read("app/deliver/DeliverForm.tsx");
    expect(src).toMatch(/const onOnline = \(\) => \{/);
    expect(src).toMatch(/removeEventListener\("online", onOnline\)/);
    expect(src).not.toMatch(/removeEventListener\("online", sync\)/);
  });
});

describe("the error screen can actually recover, in three languages", () => {
  const src = read("app/error.tsx");

  it("Try again hard-reloads a chunk failure", () => {
    // reset() re-renders the same segment, and a failed import is already
    // poisoned in the loader cache — so it failed again, identically, for
    // ever.
    expect(src).toMatch(/function retry\(\)/);
    expect(src).toMatch(/window\.location\.reload\(\)/);
    expect(src).toMatch(/onClick=\{retry\}/);
  });

  it("nothing on it is hardcoded English any more", () => {
    expect(src).toContain("t.common.errorBody");
    expect(src).toContain("t.common.home");
    const i18n = read("lib/i18n.ts");
    expect(i18n.match(/errorBody:/g) ?? []).toHaveLength(3);
    // `home` already existed in another block, so this counts the ERROR
    // screen's one specifically rather than every key with that name.
    for (const v of ['"Home"', '"Accueil"', '"Lakaz"']) {
      expect(i18n).toContain(`home: ${v}`);
    }
  });
});

describe("posting a request has a ceiling", () => {
  it("the fan-out cannot outlive the platform default silently", () => {
    // The await is deliberate — a frozen function tells nobody. But with no
    // maxDuration the gateway returns HTML past the default, which the client
    // flattens into a status with no id: the request IS created, drivers ARE
    // told, and the customer sees Post fail and posts it again.
    const src = read("app/api/delivery-requests/route.ts");
    expect(src).toMatch(/export const maxDuration = 60;/);
    expect(src).toMatch(/await notifyDriversOfNewRequest/);
  });
});

describe("the service worker fails legibly", () => {
  it("the static-asset branch catches", () => {
    const sw = read("public/sw.js");
    const branch = sw.slice(sw.indexOf('url.pathname.startsWith("/_next/static/")'));
    expect(branch.slice(0, 1200)).toMatch(/try \{/);
    expect(branch.slice(0, 1200)).toMatch(/status: 504/);
  });
});
