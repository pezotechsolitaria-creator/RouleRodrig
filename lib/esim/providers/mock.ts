import { createHash } from "node:crypto";
import type { EsimProvider, ProviderPackage } from "./types";

// ── A wholesaler that exists only on a developer's machine ───────────────────
//
// eSIM Access has no sandbox, so without this the only way to see the success
// page, the email or the admin desk is to spend real money. ESIM_PROVIDER=mock
// selects it; it answers instantly and deterministically, and its activation
// code points at `smdp.mock.invalid` — a reserved TLD no phone can ever reach,
// so a mock eSIM cannot be mistaken for a real one even if one leaked.
//
// It REFUSES to exist in production: configured() is false there, so a stray
// ESIM_PROVIDER=mock in Vercel makes the store stop selling rather than start
// handing out fake eSIMs for real money.

const PACKAGES: ProviderPackage[] = [
  pkg("GL-120_1_7", "Global (120+ areas) 1GB 7Days", 1024, 7, 4_600_000),
  pkg("GL-120_3_30", "Global (120+ areas) 3GB 30Days", 3072, 30, 11_400_000),
  pkg("GL-120_5_30", "Global (120+ areas) 5GB 30Days", 5120, 30, 18_000_000),
  pkg("GL-120_10_30", "Global (120+ areas) 10GB 30Days", 10240, 30, 34_000_000),
];

function pkg(code: string, name: string, dataMb: number, durationDays: number, micros: number): ProviderPackage {
  return {
    code,
    providerId: `MOCK-${code}`,
    name,
    dataMb,
    perDay: false,
    durationDays,
    countryCodes: ["MU", "FR", "RE", "ZA", "GB"],
    mauritiusNetworks: [{ name: "my.t", type: "4G" }],
    networksByCountry: { MU: [{ name: "my.t", type: "4G" }], FR: [{ name: "Orange", type: "5G" }] },
    wholesaleUsdMicros: micros,
    topupSupported: true,
    fupPolicy: null,
    ipExport: "UK/NO",
    raw: { mock: true },
  };
}

const isProduction = () => process.env.VERCEL_ENV === "production";
const code8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8).toUpperCase();

export const mockProvider: EsimProvider = {
  id: "mock",
  configured: () => !isProduction(),
  async listPackages() {
    return PACKAGES;
  },
  async listCatalogue(codes) {
    return PACKAGES.filter((p) => p.countryCodes.some((c) => codes.includes(c)));
  },
  async getPackage(code) {
    return PACKAGES.find((p) => p.code === code) ?? null;
  },
  async order(req) {
    // Same transactionId → same orderNo, like the real thing.
    return { orderNo: `MOCK${code8(req.transactionId)}` };
  },
  async queryOrder(orderNo) {
    const c = code8(orderNo);
    return {
      orderNo,
      profileId: `T${c}`,
      iccid: `8999000000${parseInt(c, 16).toString().padStart(10, "0").slice(0, 10)}`,
      lpa: `LPA:1$smdp.mock.invalid$MOCK-${c}`,
      qrCodeUrl: null,
      esimStatus: "GOT_RESOURCE",
      smdpStatus: "RELEASED",
      expiresAt: new Date(Date.now() + 180 * 86_400_000).toISOString(),
      totalBytes: null,
      usedBytes: 0,
      apn: null,
    };
  },
  async balanceUsdMicros() {
    return 50_000_000;
  },
  async cancelProfile() {},
  parseWebhook: () => null,
};
