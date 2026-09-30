import { createHash, createHmac, randomUUID } from "node:crypto";
import type { EsimNetwork } from "../networks";
import {
  ProviderError,
  type EsimProvider,
  type OrderRequest,
  type Profile,
  type ProviderPackage,
  type WebhookEvent,
} from "./types";

// ── eSIM Access (esimaccess.com) ─────────────────────────────────────────────
//
// Chosen because it is the only wholesaler that met every hard requirement at
// once (research 2026-09-30, docs.esimaccess.com Postman collection):
//
//   · its Mauritius packages roam onto my.t 4G — the network with the widest
//     footprint on Rodrigues ("operatorName":"my.t" in the official examples);
//   · prepaid balance, no contract, no setup or monthly fee, we set retail;
//   · a plain REST API we fully control the UI around (no widget, no brand
//     on the phone's network name).
//
// Its two weaknesses, and what this file does about them:
//
//   · NO SANDBOX. Test orders are real and are cancelled afterwards, which
//     refunds the balance while the profile is uninstalled. The store's own
//     mock provider (./mock.ts) covers development; production is proven with
//     one real purchase + cancel.
//   · WEBHOOKS ARE UNSIGNED. So a webhook is treated as a DOORBELL, never as
//     data: it only tells us which order to re-read, and the re-read is a
//     signed call to /esim/query. A forged webhook can at worst make us check
//     an order early.
//
// Auth: every call is a POST carrying four headers, the signature being
//   HMAC-SHA256(secret, timestamp + requestId + accessCode + body), lowercase
// hex — pinned in esimaccess.test.ts against the docs' own worked example.

const BASE = (process.env.ESIM_ACCESS_BASE_URL || "https://api.esimaccess.com").replace(/\/$/, "");
const ACCESS_CODE = process.env.ESIM_ACCESS_CODE || "";
const SECRET = process.env.ESIM_ACCESS_SECRET || "";

/** Their price unit: 10,000 = $1.00. Micros are 1,000,000 = $1.00. */
const E4_TO_MICROS = 100;

// Error codes that mean "ask again shortly" rather than "a human must act".
const RETRYABLE = new Set([
  "200010", // profiles are still being allocated
  "101001", // timestamp expired (clock skew) — a fresh request fixes it
  "000101", // missing header — only ever our own transient bug
]);

export function signature(timestamp: string, requestId: string, accessCode: string, body: string, secret: string): string {
  return createHmac("sha256", secret).update(timestamp + requestId + accessCode + body, "utf8").digest("hex");
}

type Envelope<T> = { success?: boolean | string; errorCode?: string | null; errorMsg?: string | null; errorMessage?: string | null; obj?: T };

async function call<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const body = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const requestId = randomUUID().replace(/-/g, "");
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/v1/open${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "RT-AccessCode": ACCESS_CODE,
        "RT-Timestamp": timestamp,
        "RT-RequestID": requestId,
        "RT-Signature": signature(timestamp, requestId, ACCESS_CODE, body, SECRET),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new ProviderError(`eSIM Access unreachable: ${(e as Error).message}`, null, true);
  }
  if (res.status === 429 || res.status >= 500) {
    throw new ProviderError(`eSIM Access HTTP ${res.status}`, String(res.status), true);
  }
  let json: Envelope<T>;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    throw new ProviderError(`eSIM Access returned non-JSON (HTTP ${res.status})`, String(res.status), true);
  }
  const ok = json.success === true || json.success === "true";
  if (!ok) {
    const code = json.errorCode ? String(json.errorCode) : null;
    const msg = json.errorMsg || json.errorMessage || "unknown error";
    throw new ProviderError(`eSIM Access ${code ?? "?"}: ${msg}`, code, code ? RETRYABLE.has(code) : false);
  }
  return (json.obj ?? ({} as T)) as T;
}

// ── Mapping ──────────────────────────────────────────────────────────────────

type RawPackage = {
  packageCode?: string;
  slug?: string;
  name?: string;
  price?: number;
  volume?: number;
  dataType?: number;
  duration?: number;
  durationUnit?: string;
  location?: string;
  supportTopUpType?: number;
  fupPolicy?: string;
  ipExport?: string;
  locationNetworkList?: {
    locationCode?: string;
    operatorList?: { operatorName?: string; networkType?: string }[];
  }[];
};

export function mapPackage(p: RawPackage): ProviderPackage | null {
  const code = (p.slug || p.packageCode || "").trim();
  const priceE4 = Number(p.price);
  const bytes = Number(p.volume);
  if (!code || !Number.isFinite(priceE4) || priceE4 <= 0 || !Number.isFinite(bytes) || bytes <= 0) return null;

  const unit = (p.durationUnit || "DAY").toUpperCase();
  const duration = Number(p.duration) || 1;
  const durationDays = unit.startsWith("MONTH") ? duration * 30 : unit.startsWith("YEAR") ? duration * 365 : duration;

  const networks = p.locationNetworkList ?? [];
  const mu = networks.find((l) => (l.locationCode || "").toUpperCase() === "MU");
  const mauritiusNetworks: EsimNetwork[] = (mu?.operatorList ?? [])
    .filter((o) => o.operatorName)
    .map((o) => ({ name: String(o.operatorName), type: o.networkType ?? null }));

  const fromList = networks.map((l) => (l.locationCode || "").toUpperCase()).filter(Boolean);
  const fromField = (p.location || "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const countryCodes = [...new Set(fromList.length ? fromList : fromField)];

  return {
    code,
    providerId: p.packageCode ?? null,
    name: p.name || code,
    // 500MB is sent as 524,288,000 bytes: binary megabytes.
    dataMb: Math.round(bytes / 1_048_576),
    perDay: (p.dataType ?? 1) !== 1,
    durationDays,
    countryCodes,
    mauritiusNetworks,
    wholesaleUsdMicros: Math.round(priceE4 * E4_TO_MICROS),
    topupSupported: (p.supportTopUpType ?? 1) !== 1,
    fupPolicy: p.fupPolicy || null,
    ipExport: p.ipExport || null,
    raw: p,
  };
}

type RawProfile = {
  orderNo?: string;
  esimTranNo?: string;
  iccid?: string;
  ac?: string;
  qrCodeUrl?: string;
  esimStatus?: string;
  smdpStatus?: string;
  expiredTime?: string;
  totalVolume?: number;
  orderUsage?: number;
  apn?: string;
};

export function mapProfile(orderNo: string, e: RawProfile): Profile {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    orderNo: e.orderNo || orderNo,
    profileId: e.esimTranNo || null,
    iccid: e.iccid || null,
    lpa: e.ac || null,
    qrCodeUrl: e.qrCodeUrl || null,
    esimStatus: e.esimStatus || null,
    smdpStatus: e.smdpStatus || null,
    expiresAt: e.expiredTime || null,
    totalBytes: num(e.totalVolume),
    usedBytes: num(e.orderUsage),
    apn: e.apn || null,
  };
}

// ── Webhooks ─────────────────────────────────────────────────────────────────
// Envelope: { notifyType, notifyId, eventGenerateTime, content: {...} }.
// ORDER_STATUS carries no ICCID; ESIM_STATUS / DATA_USAGE / VALIDITY_USAGE do.

export function parseEsimAccessWebhook(body: unknown): WebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as {
    notifyType?: string;
    notifyId?: string;
    eventGenerateTime?: string;
    content?: Record<string, unknown>;
  };
  if (!b.notifyType || typeof b.notifyType !== "string") return null;
  const c = (b.content ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof c[k] === "string" && c[k] ? (c[k] as string) : null);
  const n = (k: string) => (typeof c[k] === "number" && Number.isFinite(c[k]) ? (c[k] as number) : null);
  const key =
    typeof b.notifyId === "string" && b.notifyId
      ? `esimaccess:${b.notifyId}`
      : `esimaccess:sha256:${createHash("sha256").update(JSON.stringify(body)).digest("hex")}`;
  return {
    key,
    type: b.notifyType,
    orderNo: s("orderNo"),
    iccid: s("iccid"),
    transactionId: s("transactionId"),
    esimStatus: s("esimStatus") ?? s("orderStatus"),
    smdpStatus: s("smdpStatus"),
    totalBytes: n("totalVolume"),
    usedBytes: n("orderUsage"),
    expiresAt: s("expiredTime"),
  };
}

// ── The provider ─────────────────────────────────────────────────────────────

export const esimAccess: EsimProvider = {
  id: "esimaccess",

  configured() {
    return !!ACCESS_CODE && !!SECRET;
  },

  async listPackages(countryCode) {
    const all: ProviderPackage[] = [];
    // Single-country packages, then every multi-country package that includes
    // the country ("!GL" global, "!RG" regional) — for Mauritius the global
    // plans are where the fixed-data my.t options live.
    for (const locationCode of [countryCode, "!GL", "!RG"]) {
      const obj = await call<{ packageList?: RawPackage[] }>("/package/list", { locationCode, type: "BASE" });
      for (const raw of obj.packageList ?? []) {
        const p = mapPackage(raw);
        if (p && p.countryCodes.includes(countryCode.toUpperCase())) all.push(p);
      }
    }
    // A package can come back under more than one filter.
    return [...new Map(all.map((p) => [p.code, p])).values()];
  },

  async getPackage(code) {
    const obj = await call<{ packageList?: RawPackage[] }>("/package/list", { slug: code, type: "BASE" });
    const hit = (obj.packageList ?? []).map(mapPackage).find((p) => p && (p.code === code || p.providerId === code));
    return hit ?? null;
  },

  async order(req: OrderRequest) {
    const info: Record<string, unknown> = { packageCode: req.code, count: 1 };
    if (req.periodNum) info.periodNum = req.periodNum;
    const payload: Record<string, unknown> = { transactionId: req.transactionId, packageInfoList: [info] };
    // The price guard: if the wholesaler has raised the price since our check,
    // it refuses (200005/200006) instead of quietly charging more.
    if (req.expectedUnitUsdMicros && !req.periodNum) {
      const e4 = Math.round(req.expectedUnitUsdMicros / E4_TO_MICROS);
      info.price = e4;
      payload.amount = e4;
    }
    const obj = await call<{ orderNo?: string }>("/esim/order", payload);
    if (!obj.orderNo) throw new ProviderError("eSIM Access accepted the order but returned no orderNo", null, false);
    return { orderNo: obj.orderNo };
  },

  async queryOrder(orderNo) {
    try {
      const obj = await call<{ esimList?: RawProfile[] }>("/esim/query", {
        orderNo,
        iccid: "",
        pager: { pageNum: 1, pageSize: 5 },
      });
      const e = (obj.esimList ?? [])[0];
      if (!e || !e.ac) return null;
      return mapProfile(orderNo, e);
    } catch (err) {
      // "Still allocating" is the normal state for the first few seconds.
      if (err instanceof ProviderError && err.code === "200010") return null;
      throw err;
    }
  },

  async balanceUsdMicros() {
    const obj = await call<{ balance?: number }>("/balance/query", {});
    return Math.round(Number(obj.balance ?? 0) * E4_TO_MICROS);
  },

  async cancelProfile(profileId) {
    await call("/esim/cancel", { esimTranNo: profileId });
  },

  parseWebhook: parseEsimAccessWebhook,

  async setWebhook(url) {
    await call("/webhook/save", { webhook: url });
  },
};
