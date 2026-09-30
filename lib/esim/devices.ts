// ── Will my phone take an eSIM? ──────────────────────────────────────────────
//
// Conservative on purpose. A phone listed here that turns out not to support
// eSIM is a refund and a stranded traveller; a phone missing from the list is
// a shopper who dials *#06# and finds out in ten seconds. So the list names
// models we are confident about, and the UI always offers the *#06# test —
// the one check that is never wrong — as the final answer.
//
// Two caveats apply to EVERY model and the UI states both:
//   · the phone must be carrier-UNLOCKED (a locked phone refuses other SIMs);
//   · phones sold in mainland China, Hong Kong and Macau usually have two
//     physical SIM slots and no eSIM, whatever the model name.

export type DeviceFamily = { brand: string; models: string[]; note?: { en: string; fr: string } };

export const ESIM_DEVICES: DeviceFamily[] = [
  {
    brand: "Apple iPhone",
    models: [
      "iPhone 17, 17 Pro, 17 Pro Max, iPhone Air",
      "iPhone 16, 16 Plus, 16 Pro, 16 Pro Max, 16e",
      "iPhone 15, 15 Plus, 15 Pro, 15 Pro Max",
      "iPhone 14, 14 Plus, 14 Pro, 14 Pro Max",
      "iPhone 13, 13 mini, 13 Pro, 13 Pro Max",
      "iPhone 12, 12 mini, 12 Pro, 12 Pro Max",
      "iPhone 11, 11 Pro, 11 Pro Max",
      "iPhone XS, XS Max, XR",
      "iPhone SE (2020 and 2022)",
    ],
    note: {
      en: "iPhones from the US since the 14 are eSIM-only — they work perfectly.",
      fr: "Les iPhone américains depuis le 14 sont uniquement eSIM — ils fonctionnent parfaitement.",
    },
  },
  {
    brand: "Samsung Galaxy",
    models: [
      "Galaxy S25, S25+, S25 Ultra, S25 Edge, S25 FE",
      "Galaxy S24, S24+, S24 Ultra, S24 FE",
      "Galaxy S23, S23+, S23 Ultra, S23 FE",
      "Galaxy S22, S22+, S22 Ultra",
      "Galaxy S21, S21+, S21 Ultra",
      "Galaxy S20, S20+, S20 Ultra",
      "Galaxy Z Fold 2 to Fold 7, Z Flip to Flip 7",
      "Galaxy A56, A55, A54, A36, A35",
      "Galaxy Note 20, Note 20 Ultra",
    ],
    note: {
      en: "Some Galaxy S20/S21 sold in the US and Korea have no eSIM — use the *#06# test.",
      fr: "Certains Galaxy S20/S21 vendus aux États-Unis et en Corée n'ont pas d'eSIM — faites le test *#06#.",
    },
  },
  {
    brand: "Google Pixel",
    models: [
      "Pixel 10, 10 Pro, 10 Pro XL, 10 Pro Fold",
      "Pixel 9, 9 Pro, 9 Pro XL, 9 Pro Fold, 9a",
      "Pixel 8, 8 Pro, 8a",
      "Pixel 7, 7 Pro, 7a",
      "Pixel 6, 6 Pro, 6a",
      "Pixel 5, 5a, Pixel 4, 4a, 4 XL",
      "Pixel 3, 3 XL (not 3a bought in Japan or from some US carriers)",
    ],
  },
  {
    brand: "Xiaomi",
    models: ["Xiaomi 15, 15 Pro, 15 Ultra", "Xiaomi 14, 14 Pro, 14T, 14T Pro", "Xiaomi 13, 13 Pro, 13 Lite, 13T, 13T Pro", "Xiaomi 12T Pro"],
  },
  {
    brand: "Motorola",
    models: ["Razr 2019 and later", "Edge 40, 40 Pro, 50, 50 Pro, 50 Ultra", "Moto G54, G84, G85"],
  },
  {
    brand: "Oppo · OnePlus · Honor · Huawei",
    models: [
      "Oppo Find X3 Pro, Find X5, X5 Pro, Find X8, X8 Pro, Reno 5A",
      "OnePlus 12, 13 (international versions)",
      "Honor Magic 4 Pro, Magic 5 Pro, Magic 6 Pro, Magic 7 Pro",
      "Huawei P40, P40 Pro, Mate 40 Pro",
    ],
  },
  {
    brand: "Sony · Nokia · Fairphone",
    models: ["Xperia 1 IV and later, Xperia 5 IV and later, Xperia 10 IV and later", "Nokia G60, X30", "Fairphone 4, 5"],
  },
];

/** Case-insensitive search; returns families with the matching model lines. */
export function searchDevices(query: string): DeviceFamily[] {
  const q = query.trim().toLowerCase();
  if (!q) return ESIM_DEVICES;
  const words = q.split(/\s+/).filter(Boolean);
  const hit = (s: string) => words.every((w) => s.toLowerCase().includes(w));
  return ESIM_DEVICES.map((f) => ({
    ...f,
    models: f.models.filter((m) => hit(`${f.brand} ${m}`)),
  })).filter((f) => f.models.length > 0);
}
