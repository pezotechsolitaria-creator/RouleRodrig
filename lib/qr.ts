// ── WHERE THE PRINTED CODE SENDS PEOPLE ─────────────────────────────────────
//
// One constant, so the artwork, the component and the tests cannot disagree
// about it. scripts/generate-qr.mjs carries the same string — it has to, being
// a .mjs script that cannot import TypeScript — and lib/qr-assets.test.ts
// decodes the committed PNGs and compares them to THIS value, so the two
// copies drifting apart fails the build rather than reaching a printer.
//
// NOT SITE_URL from lib/site.ts, deliberately. That falls back to
// roule-rodrig.vercel.app when NEXT_PUBLIC_SITE_URL is unset, and middleware.ts
// lists that host in RETIRED_HOSTS and redirects away from it. A sticker
// printed from a fallback would depend on a redirect that exists to retire the
// host it points at.
//
// This is also why it is a literal rather than an env var: a QR generated from
// configuration is a QR that changes when the configuration does, and the ones
// already on doors around the island do not get to change with it.
export const QR_TARGET = "https://roulerodrig.com/";

/** The committed artwork. Static files in /public, never generated at runtime. */
export const QR_ASSETS = {
  branded: {
    svg: "/qr/roule-rodrigues-qr-branded.svg",
    png: "/qr/roule-rodrigues-qr-branded.png",
  },
  clean: {
    svg: "/qr/roule-rodrigues-qr.svg",
    png: "/qr/roule-rodrigues-qr.png",
  },
} as const;
