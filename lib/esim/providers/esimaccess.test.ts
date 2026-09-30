import { describe, expect, it } from "vitest";
import { signature, mapPackage, mapProfile, parseEsimAccessWebhook } from "./esimaccess";
import { coversRodrigues } from "../networks";

describe("eSIM Access request signing", () => {
  it("matches the worked example in the official docs", () => {
    // docs.esimaccess.com → Authentication → "Signature Example".
    const sig = signature("1628670421", "4ce9d9cdac9e4e17b3a2c66c358c1ce2", "11111", '{"imsi":"326543826"}', "1111");
    expect(sig).toBe("7eb765e27df5373dea2dbc8c41a7d9557743e46c8054750f3d851b3fd01d0835");
  });
});

// The Mauritius day pass exactly as the official docs return it.
const MU_DAILY = {
  packageCode: "P4ZKUW7DZ",
  slug: "MU_0.5_Daily",
  name: "Mauritius 500MB/Day",
  price: 31000,
  currencyCode: "USD",
  volume: 524288000,
  dataType: 2,
  duration: 1,
  durationUnit: "DAY",
  location: "MU",
  supportTopUpType: 1,
  fupPolicy: "384 Kbps",
  ipExport: "UK/NO",
  locationNetworkList: [
    { locationName: "Mauritius", locationCode: "MU", operatorList: [{ operatorName: "my.t", networkType: "4G" }] },
  ],
};

describe("mapPackage", () => {
  it("maps the docs' Mauritius day pass", () => {
    const p = mapPackage(MU_DAILY)!;
    expect(p).toMatchObject({
      code: "MU_0.5_Daily",
      providerId: "P4ZKUW7DZ",
      dataMb: 500,
      perDay: true,
      durationDays: 1,
      countryCodes: ["MU"],
      wholesaleUsdMicros: 3_100_000, // 31000 × 1/10,000 USD = $3.10
      topupSupported: false,
      fupPolicy: "384 Kbps",
      ipExport: "UK/NO",
    });
    expect(p.mauritiusNetworks).toEqual([{ name: "my.t", type: "4G" }]);
    expect(coversRodrigues(p.mauritiusNetworks)).toBe(true);
  });

  it("reads Mauritius' operators out of a multi-country package", () => {
    const p = mapPackage({
      slug: "GL-120_3_30",
      packageCode: "PW6P3DX2G",
      name: "Global (120+ areas) 3GB 30Days",
      price: 114000,
      volume: 3 * 1073741824,
      dataType: 1,
      duration: 30,
      durationUnit: "DAY",
      supportTopUpType: 2,
      locationNetworkList: [
        { locationCode: "FR", operatorList: [{ operatorName: "Orange", networkType: "5G" }] },
        { locationCode: "MU", operatorList: [{ operatorName: "my.t", networkType: "4G" }] },
      ],
    })!;
    expect(p.dataMb).toBe(3072);
    expect(p.perDay).toBe(false);
    expect(p.durationDays).toBe(30);
    expect(p.countryCodes).toEqual(["FR", "MU"]);
    // France's "Orange" must NOT leak into the Mauritius coverage decision.
    expect(p.mauritiusNetworks).toEqual([{ name: "my.t", type: "4G" }]);
    expect(p.topupSupported).toBe(true);
  });

  it("marks a Chili-only package as not covering Rodrigues", () => {
    const p = mapPackage({ ...MU_DAILY, locationNetworkList: [{ locationCode: "MU", operatorList: [{ operatorName: "Chili" }] }] })!;
    expect(coversRodrigues(p.mauritiusNetworks)).toBe(false);
  });

  it("drops a package with no price or volume rather than inventing one", () => {
    expect(mapPackage({ ...MU_DAILY, price: 0 })).toBeNull();
    expect(mapPackage({ ...MU_DAILY, volume: undefined })).toBeNull();
    expect(mapPackage({ ...MU_DAILY, slug: "", packageCode: "" })).toBeNull();
  });
});

describe("mapProfile", () => {
  it("keys the profile on esimTranNo and keeps the activation string", () => {
    const p = mapProfile("B23051616050537", {
      esimTranNo: "23120118156818",
      iccid: "8943108170000775671",
      ac: "LPA:1$rsp-eu.redteamobile.com$ABCDEF123",
      qrCodeUrl: "https://p.qrsim.net/x.png",
      esimStatus: "GOT_RESOURCE",
      smdpStatus: "RELEASED",
      totalVolume: 3221225472,
      orderUsage: 0,
    });
    expect(p).toMatchObject({ orderNo: "B23051616050537", profileId: "23120118156818", lpa: "LPA:1$rsp-eu.redteamobile.com$ABCDEF123", usedBytes: 0 });
  });
});

describe("parseEsimAccessWebhook", () => {
  it("parses ORDER_STATUS and keys it on notifyId", () => {
    const ev = parseEsimAccessWebhook({
      notifyType: "ORDER_STATUS",
      notifyId: "n-123",
      content: { orderNo: "B1", orderStatus: "GOT_RESOURCE", transactionId: "0a1b2c3d-0000-4000-8000-000000000000" },
    })!;
    expect(ev).toMatchObject({ key: "esimaccess:n-123", type: "ORDER_STATUS", orderNo: "B1", esimStatus: "GOT_RESOURCE" });
    expect(ev.transactionId).toBe("0a1b2c3d-0000-4000-8000-000000000000");
  });
  it("parses DATA_USAGE figures", () => {
    const ev = parseEsimAccessWebhook({ notifyType: "DATA_USAGE", content: { iccid: "89", totalVolume: 100, orderUsage: 40 } })!;
    expect(ev.usedBytes).toBe(40);
    expect(ev.totalBytes).toBe(100);
    // No notifyId → a content hash, so a redelivery still dedupes.
    expect(ev.key).toMatch(/^esimaccess:sha256:[0-9a-f]{64}$/);
  });
  it("ignores anything that is not one", () => {
    expect(parseEsimAccessWebhook(null)).toBeNull();
    expect(parseEsimAccessWebhook({ hello: 1 })).toBeNull();
    expect(parseEsimAccessWebhook("x")).toBeNull();
  });
});
