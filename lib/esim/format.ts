// ── How a plan is named on screen and in email ───────────────────────────────
// Pure. The wholesaler's own name ("Global (120+ areas) 3GB 30Days") is never
// shown: it names a product we do not sell (a global plan) and in a format
// nobody reads. The shopper sees what they are buying — data and days.

export type PlanShape = {
  data_mb: number;
  per_day: boolean;
  validity_days: number;
};

type Lang = "en" | "fr" | "cr";

export function dataLabel(dataMb: number, lang: Lang = "en"): string {
  const unitG = lang === "en" ? "GB" : "Go";
  const unitM = lang === "en" ? "MB" : "Mo";
  if (dataMb >= 1024) {
    const gb = dataMb / 1024;
    const v = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
    return `${lang === "en" ? v : v.replace(".", ",")} ${unitG}`;
  }
  return `${dataMb} ${unitM}`;
}

export function daysLabel(days: number, lang: Lang = "en"): string {
  if (lang === "en") return `${days} day${days === 1 ? "" : "s"}`;
  return `${days} jour${days === 1 ? "" : "s"}`;
}

/** "3 GB · 30 days", "1 GB / day · 7 days", "3 Go · 30 jours". */
export function planLabel(p: PlanShape, lang: Lang = "en"): string {
  const data = p.per_day ? `${dataLabel(p.data_mb, lang)} / ${lang === "en" ? "day" : "jour"}` : dataLabel(p.data_mb, lang);
  return `${data} · ${daysLabel(p.validity_days, lang)}`;
}

/**
 * A rough sense of what the data buys, because "3 GB" means nothing to most
 * travellers. Deliberately conservative figures (maps + messaging ≈ 100 MB a
 * day, a little Instagram ≈ 250 MB, video calls far more) so nobody runs out
 * because a number on this page was optimistic.
 */
export function usageHint(p: PlanShape, lang: Lang = "en"): string {
  const perDay = p.per_day ? p.data_mb : p.data_mb / Math.max(1, p.validity_days);
  const days = Math.floor(p.data_mb / 150);
  const covers = p.per_day || days >= p.validity_days;
  // SHORT on purpose: this sits in a half-width card on a 375px phone, and a
  // clipped hint ("…for about 6 days of…") is worse than none.
  if (lang === "en") {
    if (perDay >= 700) return "Maps, social & video calls, daily";
    if (p.per_day) return "Maps, WhatsApp & social, daily";
    if (covers && perDay >= 300) return `Maps, WhatsApp & social, all ${p.validity_days} days`;
    if (covers) return `Maps & WhatsApp, all ${p.validity_days} days`;
    return `~${days} days of maps & WhatsApp`;
  }
  if (perDay >= 700) return "Cartes, réseaux et visio, chaque jour";
  if (p.per_day) return "Cartes, WhatsApp et réseaux, chaque jour";
  if (covers && perDay >= 300) return `Cartes, WhatsApp et réseaux, ${p.validity_days} jours`;
  if (covers) return `Cartes et WhatsApp, ${p.validity_days} jours`;
  return `~${days} jours de cartes et WhatsApp`;
}
