import type { ProviderPackage } from "./providers/types";
import { coversRodrigues } from "./networks";
import { suggestRetailEurCents } from "./pricing";
import { HOME_CODE } from "./destinations";

// ── Wholesale package → sellable product (pure) ──────────────────────────────
// Shared by the live catalogue sync (lib/esim/admin.ts) and the launch seed,
// so the two can never store the same package two different ways.

/** Day-pass lengths offered as products: one week, two weeks — the shape of
 *  almost every trip to or from Rodrigues (there are only a few flights a day). */
export const DAY_PASS_PERIODS = [7, 14] as const;

export type Product = { code: string; period: number | null; pkg: ProviderPackage };

export function productsFor(pkg: ProviderPackage): Product[] {
  if (!pkg.perDay) return [{ code: pkg.code, period: null, pkg }];
  return DAY_PASS_PERIODS.map((n) => ({ code: pkg.code, period: n, pkg }));
}

/** The row a product is stored as — shared by the live sync and the seed. */
export function planRowFor(prod: Product, rate: number) {
  const { pkg } = prod;
  const units = prod.period ?? 1;
  const wholesale = pkg.wholesaleUsdMicros * units;
  return {
    provider_code: prod.code,
    provider_slug: pkg.code,
    name: prod.period ? `${pkg.name} × ${prod.period} days` : pkg.name,
    region: pkg.countryCodes.includes(HOME_CODE) ? "mauritius" : "world",
    country_codes: pkg.countryCodes.length ? pkg.countryCodes : [HOME_CODE],
    data_mb: pkg.dataMb,
    per_day: pkg.perDay,
    period_num: prod.period,
    validity_days: Math.min(366, prod.period ?? pkg.durationDays),
    networks: pkg.mauritiusNetworks,
    networks_by_country: pkg.networksByCountry,
    covers_rodrigues: coversRodrigues(pkg.mauritiusNetworks),
    topup_supported: pkg.topupSupported,
    fup_policy: pkg.fupPolicy,
    ip_export: pkg.ipExport,
    wholesale_usd_micros: wholesale,
    suggested_retail_eur_cents: suggestRetailEurCents(wholesale, rate),
  };
}

