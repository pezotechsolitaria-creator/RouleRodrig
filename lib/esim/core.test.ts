import { describe, expect, it } from "vitest";
import { parseActivation, buildActivation, appleInstallUrl, androidInstallUrl } from "./lpa";
import { refFor, normaliseRef, newOrderId, newOrderSalt, orderLinkKey, linkKeyMatches } from "./ids";
import { planLabel, dataLabel, usageHint } from "./format";
import { searchDevices } from "./devices";
import { esimFaq, IOS_STEPS, ANDROID_STEPS } from "./content";

describe("parseActivation", () => {
  it("parses the canonical LPA string", () => {
    expect(parseActivation("LPA:1$rsp-eu.redteamobile.com$ABCD1234EF")).toEqual({
      lpa: "LPA:1$rsp-eu.redteamobile.com$ABCD1234EF",
      smdpAddress: "rsp-eu.redteamobile.com",
      activationCode: "ABCD1234EF",
    });
  });
  it("tolerates a missing prefix, whitespace and trailing fields", () => {
    expect(parseActivation("  1$smdp.example.com$AB-12-CD$1.3.6.1$1 ")?.lpa).toBe("LPA:1$smdp.example.com$AB-12-CD");
  });
  it.each([null, "", "LPA:2$x.com$abcd", "LPA:1$$ABCD", "LPA:1$nodot$ABCD", "LPA:1$a.com$<script>", "hello"])(
    "rejects %j",
    (raw) => {
      expect(parseActivation(raw as string | null)).toBeNull();
    },
  );
  it("builds from halves", () => {
    expect(buildActivation("a.example.com", "XYZ1")?.lpa).toBe("LPA:1$a.example.com$XYZ1");
  });
  it("encodes the whole string into the one-tap links", () => {
    const lpa = "LPA:1$rsp.example.com$ABCD1234";
    expect(appleInstallUrl(lpa)).toBe(
      "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.example.com%24ABCD1234",
    );
    expect(androidInstallUrl(lpa)).toContain("esimsetup.android.com");
  });
});

describe("order identifiers", () => {
  it("builds and normalises the human ref", () => {
    const id = "0a1b2c3d-0000-4000-8000-000000000000";
    expect(refFor(id)).toBe("ES-0A1B2C");
    expect(normaliseRef("es 0a1b2c")).toBe("ES-0A1B2C");
    expect(normaliseRef("ES-0A1B2C ")).toBe("ES-0A1B2C");
    expect(normaliseRef("RR-0A1B2C")).toBeNull();
    expect(normaliseRef("ES-XYZ")).toBeNull();
  });
  it("a link key opens its own order and nothing else", () => {
    const id = newOrderId();
    const salt = newOrderSalt();
    const key = orderLinkKey(id, salt, "secret-1");
    expect(key).toHaveLength(32);
    expect(linkKeyMatches(key, id, salt, "secret-1")).toBe(true);
    expect(linkKeyMatches(key, newOrderId(), salt, "secret-1")).toBe(false);
    expect(linkKeyMatches(key, id, newOrderSalt(), "secret-1")).toBe(false); // rotated salt revokes
    expect(linkKeyMatches(key, id, salt, "secret-2")).toBe(false);
    expect(linkKeyMatches(null, id, salt, "secret-1")).toBe(false);
    expect(linkKeyMatches(key.slice(0, 31), id, salt, "secret-1")).toBe(false);
  });
});

describe("plan names", () => {
  it("names a plan by what it gives, in each language", () => {
    expect(planLabel({ data_mb: 3072, per_day: false, validity_days: 30 }, "en")).toBe("3 GB · 30 days");
    expect(planLabel({ data_mb: 3072, per_day: false, validity_days: 30 }, "fr")).toBe("3 Go · 30 jours");
    expect(planLabel({ data_mb: 1024, per_day: true, validity_days: 7 }, "en")).toBe("1 GB / day · 7 days");
    expect(dataLabel(500)).toBe("500 MB");
    expect(dataLabel(1536, "fr")).toBe("1,5 Go");
  });
  it("never promises more days than the plan has", () => {
    const hint = usageHint({ data_mb: 10240, per_day: false, validity_days: 30 }, "en");
    expect(hint).toContain("30 days");
    expect(usageHint({ data_mb: 1024, per_day: false, validity_days: 7 }, "en")).toMatch(/~6 days/);
  });
});

describe("device search", () => {
  it("finds a model across brands, case-insensitively", () => {
    const r = searchDevices("iphone 13");
    expect(r).toHaveLength(1);
    expect(r[0].models.join(" ")).toContain("iPhone 13");
    expect(searchDevices("galaxy s23")[0].brand).toBe("Samsung Galaxy");
    expect(searchDevices("nokia 3310")).toHaveLength(0);
  });
});

describe("the FAQ", () => {
  it("states the price it is given and never invents one", () => {
    const en = esimFaq("en", "€6.90").map((f) => f.a).join(" ");
    expect(en).toContain("€6.90");
    const noPrice = esimFaq("en", null).map((f) => f.a).join(" ");
    expect(noPrice).not.toMatch(/€\d/);
  });
  it("names only the countries the widest plan really covers", () => {
    const withFr = esimFaq("en", null, ["MU", "FR", "AE"]);
    const abroad = withFr[withFr.length - 1];
    expect(abroad.a).toContain("3 countries");
    expect(abroad.a).toContain("France");
    expect(abroad.a).not.toContain("Seychelles");
    expect(abroad.a).toContain("Réunion is not one of them");
    // A single-country catalogue has no "where else" answer at all.
    expect(esimFaq("en", null, ["MU"]).some((f) => /where else/i.test(f.q))).toBe(false);
  });
  it("tells the Rodrigues network truth in both languages", () => {
    for (const lang of ["en", "fr"] as const) {
      const first = esimFaq(lang, null)[0].a;
      expect(first).toMatch(/my\.t/);
      expect(first).toMatch(/Emtel/);
      expect(first).toMatch(/Chili/);
    }
  });
  it("has the same number of install steps in English and French", () => {
    expect(IOS_STEPS.en).toHaveLength(IOS_STEPS.fr.length);
    expect(ANDROID_STEPS.en).toHaveLength(ANDROID_STEPS.fr.length);
  });
});
