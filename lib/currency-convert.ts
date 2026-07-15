// Ti Roulé's conversational currency converter — detects a currency question in
// free text and formats the answer. Live rates come from /api/rates; if those
// fail, it falls back to a small fixed reference table and labels the result an
// ESTIMATE (never pretends an estimate is live). Never fabricates a rate.

type Language = "en" | "fr" | "cr";

type CurrencyDef = { code: string; symbols: string[]; names: string[] };

// Common travel currencies + the Mauritian rupee. Symbols kept unambiguous.
const CURRENCIES: CurrencyDef[] = [
  { code: "MUR", symbols: ["rs", "₨"], names: ["mur", "mauritian rupee", "mauritian rupees", "rupee", "rupees", "roupie", "roupies", "roupi"] },
  { code: "USD", symbols: ["us$", "$"], names: ["usd", "us dollar", "us dollars", "american dollar", "dollar", "dollars"] },
  { code: "EUR", symbols: ["€"], names: ["eur", "euro", "euros"] },
  { code: "GBP", symbols: ["£"], names: ["gbp", "pound", "pounds", "sterling", "british pound"] },
  { code: "INR", symbols: [], names: ["inr", "indian rupee", "indian rupees"] },
  { code: "MYR", symbols: ["rm"], names: ["myr", "ringgit", "malaysian ringgit"] },
  { code: "SGD", symbols: ["s$"], names: ["sgd", "singapore dollar", "singapore dollars"] },
  { code: "AUD", symbols: ["a$"], names: ["aud", "australian dollar", "australian dollars"] },
  { code: "CAD", symbols: ["c$"], names: ["cad", "canadian dollar", "canadian dollars"] },
  { code: "ZAR", symbols: [], names: ["zar", "rand", "south african rand"] },
  { code: "CHF", symbols: [], names: ["chf", "swiss franc", "swiss francs"] },
  { code: "CNY", symbols: [], names: ["cny", "rmb", "yuan", "renminbi", "chinese yuan"] },
  { code: "JPY", symbols: ["¥"], names: ["jpy", "yen", "japanese yen"] },
  { code: "AED", symbols: [], names: ["aed", "dirham", "dirhams"] },
];

const ZERO_DECIMAL = new Set(["MUR", "JPY", "KRW", "IDR", "VND", "HUF", "CLP", "ISK"]);

// Rough MUR-per-unit fallback (only used, and clearly labelled, when live fails).
const ESTIMATE_MUR_PER: Record<string, number> = { MUR: 1, USD: 46, EUR: 49, GBP: 58 };

export type CurrencyQuery = { amount: number; from: string; to: string };

function detect(text: string): { code: string; pos: number }[] {
  const hits: { code: string; pos: number }[] = [];
  for (const cur of CURRENCIES) {
    let best = -1;
    for (const s of cur.symbols) {
      const i = text.indexOf(s);
      if (i >= 0 && (best < 0 || i < best)) best = i;
    }
    for (const n of cur.names) {
      const re = new RegExp(`(?:^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z]|$)`);
      const m = re.exec(text);
      if (m && (best < 0 || m.index < best)) best = m.index;
    }
    if (best >= 0) hits.push({ code: cur.code, pos: best });
  }
  return hits;
}

export function parseCurrencyQuery(text: string): CurrencyQuery | null {
  const t = ` ${text.toLowerCase()} `;
  const numMatch = t.match(/(\d[\d,]*(?:\.\d+)?)/);
  if (!numMatch) return null;
  const amount = parseFloat(numMatch[1].replace(/,/g, ""));
  if (!isFinite(amount) || amount <= 0) return null;

  const seen = new Map<string, number>();
  for (const h of detect(t)) if (!seen.has(h.code) || h.pos < seen.get(h.code)!) seen.set(h.code, h.pos);
  const ordered = [...seen.entries()].map(([code, pos]) => ({ code, pos })).sort((a, b) => a.pos - b.pos);
  if (ordered.length === 0) return null;

  let from: string;
  let to: string;
  if (ordered.length >= 2) {
    const sep = t.search(/\b(?:to|in|into|en|dan)\b/);
    if (sep >= 0) {
      const before = ordered.filter((o) => o.pos < sep);
      const after = ordered.filter((o) => o.pos > sep);
      from = (before[0] ?? ordered[0]).code;
      to = (after[0] ?? ordered[ordered.length - 1]).code;
    } else {
      from = ordered[0].code;
      to = ordered[1].code;
    }
  } else {
    from = ordered[0].code;
    to = from === "MUR" ? "USD" : "MUR";
  }
  if (from === to) return null;
  return { amount, from, to };
}

// Fallback conversion using the fixed reference table. Returns null if either
// currency isn't in the small estimate set.
export function estimateConvert(q: CurrencyQuery): { converted: number; rate: number } | null {
  const f = ESTIMATE_MUR_PER[q.from];
  const t = ESTIMATE_MUR_PER[q.to];
  if (!f || !t) return null;
  const rate = f / t;
  return { converted: q.amount * rate, rate };
}

const L = {
  en: { rate: "Exchange rate", tip: "🛵 That's a handy daily budget for exploring Rodrigues by scooter.", est: "≈ Estimate — I couldn't reach live rates, so treat this as approximate." },
  fr: { rate: "Taux de change", tip: "🛵 De quoi explorer Rodrigues à scooter pendant une journée.", est: "≈ Estimation — je n'ai pas pu obtenir les taux en direct, à prendre comme approximatif." },
  cr: { rate: "To de sanz", tip: "🛵 Enn bon bidze pou explor Rodrigues an skooter enn zourne.", est: "≈ Estimasion — mo pa finn kapav gagn to an direk, alor pran li kouma apepre." },
};

function num(n: number, dp: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n);
}

export function formatConversion(q: CurrencyQuery, converted: number, rate: number, lang: Language, live = true): string {
  const l = L[lang] ?? L.en;
  const amtDp = Number.isInteger(q.amount) ? 0 : 2;
  const outDp = ZERO_DECIMAL.has(q.to) ? 0 : 2;
  const rateDp = rate >= 10 ? 2 : rate >= 0.1 ? 4 : 6;
  const lines = [
    `${num(q.amount, amtDp)} ${q.from} ≈ ${num(converted, outDp)} ${q.to}`,
    "",
    `${l.rate}: 1 ${q.from} = ${num(rate, rateDp)} ${q.to}`,
  ];
  if (!live) lines.push("", l.est);
  else if (q.to === "MUR") lines.push("", l.tip);
  return lines.join("\n");
}
