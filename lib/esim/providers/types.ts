import type { EsimNetwork } from "../networks";

// ── The wholesaler contract ──────────────────────────────────────────────────
//
// Everything the store needs from an eSIM wholesaler, and nothing it does not.
// eSIM Access is the one wired today (./esimaccess.ts); a second wholesaler —
// Airalo's Partner API is the obvious candidate for Emtel-only coverage — is
// one more file implementing this interface, not a rewrite of the store.

export type ProviderPackage = {
  /** The identifier we order with. For eSIM Access this is the SLUG
   *  ("GL-120_3_30"), which their docs name as the stable alias. */
  code: string;
  /** The wholesaler's own opaque id, kept for support conversations. */
  providerId: string | null;
  name: string;
  dataMb: number;
  /** True for day passes: dataMb is per 24h, and the package is bought ×N days. */
  perDay: boolean;
  /** Validity of ONE unit of the package, in days (1 for a day pass). */
  durationDays: number;
  /** Every country the package works in (ISO-2), MU included or not. */
  countryCodes: string[];
  /** Operators in MAURITIUS only — the ones that decide Rodrigues coverage. */
  mauritiusNetworks: EsimNetwork[];
  /** Price of ONE unit (one day, for a day pass), millionths of a USD. */
  wholesaleUsdMicros: number;
  topupSupported: boolean;
  fupPolicy: string | null;
  ipExport: string | null;
  raw: unknown;
};

export type OrderRequest = {
  /** Our order id. Repeating it must return the SAME wholesale order. */
  transactionId: string;
  code: string;
  /** Days, for a day pass; null for a fixed plan. */
  periodNum: number | null;
  /** The per-unit price we expect to pay, as a guard against a silent rise.
   *  Omitted when unknown (day passes carry duration discounts we cannot
   *  predict exactly, and a mismatch refuses the order). */
  expectedUnitUsdMicros: number | null;
};

export type Profile = {
  orderNo: string;
  /** eSIM Access keys profiles on esimTranNo — ICCIDs get recycled. */
  profileId: string | null;
  iccid: string | null;
  /** "LPA:1$smdp$code". */
  lpa: string | null;
  qrCodeUrl: string | null;
  esimStatus: string | null;
  smdpStatus: string | null;
  expiresAt: string | null;
  totalBytes: number | null;
  usedBytes: number | null;
  apn: string | null;
};

export type WebhookEvent = {
  /** Unique per notification; a redelivery carries the same key. */
  key: string;
  type: string;
  orderNo: string | null;
  iccid: string | null;
  transactionId: string | null;
  esimStatus: string | null;
  smdpStatus: string | null;
  totalBytes: number | null;
  usedBytes: number | null;
  expiresAt: string | null;
};

export interface EsimProvider {
  readonly id: string;
  /** Credentials present. False → the store shows plans but sells nothing. */
  configured(): boolean;
  listPackages(countryCode: string): Promise<ProviderPackage[]>;
  /** One package by code, at today's price. Null when the wholesaler dropped it. */
  getPackage(code: string): Promise<ProviderPackage | null>;
  /** Places the wholesale order. Returns the wholesaler's order number. */
  order(req: OrderRequest): Promise<{ orderNo: string }>;
  /** The allocated profile, or null while it is still being prepared. */
  queryOrder(orderNo: string): Promise<Profile | null>;
  /** Wholesale balance, millionths of a USD. */
  balanceUsdMicros(): Promise<number>;
  /** Cancels a NEVER-INSTALLED profile and returns its cost to our balance. */
  cancelProfile(profileId: string): Promise<void>;
  /** Parses a webhook body; null for anything that is not one of ours. */
  parseWebhook(body: unknown): WebhookEvent | null;
  /** Registers our webhook URL with the wholesaler. */
  setWebhook?(url: string): Promise<void>;
}

/**
 * A wholesaler failure, classified — because what the store does next depends
 * entirely on which kind it is:
 *
 *   retryable   network blip, rate limit, "profile not ready": try again.
 *   definitive  the wholesaler will say the same thing next time — no
 *               balance, package withdrawn, price changed. A human must act
 *               (top up, reprice, refund) and the owner is emailed.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
