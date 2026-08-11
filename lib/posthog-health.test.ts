import { describe, it, expect } from "vitest";
import {
  buildIngestionQuery,
  extractCount,
  interpretEventCount,
  notConfiguredVerdict,
  readHealthConfig,
  INGESTION_WINDOW_HOURS,
} from "./posthog-health";

describe("buildIngestionQuery", () => {
  it("counts events inside the window and sends no customer data", () => {
    const q = buildIngestionQuery(24);

    expect(q).toContain("count()");
    expect(q).toContain("INTERVAL 24 HOUR");
    // A bare count is the whole point — nothing person-shaped in the query.
    expect(q).not.toMatch(/person|email|distinct_id|properties/i);
  });
});

describe("interpretEventCount", () => {
  it("treats a real count as healthy", () => {
    const v = interpretEventCount(1284);

    expect(v.healthy).toBe(true);
    expect(v.status).toBe("healthy");
    expect(v.eventCount).toBe(1284);
  });

  it("treats zero events as the silent-failure case that must alert", () => {
    const v = interpretEventCount(0);

    expect(v.healthy).toBe(false);
    expect(v.status).toBe("silent");
    expect(v.detail).toMatch(/no events/i);
  });

  it("treats an unusable response as an error rather than silently passing", () => {
    expect(interpretEventCount(null).status).toBe("error");
    expect(interpretEventCount(null).healthy).toBe(false);
    expect(interpretEventCount(NaN).status).toBe("error");
  });

  it("defaults to the shared window", () => {
    expect(interpretEventCount(5).windowHours).toBe(INGESTION_WINDOW_HOURS);
  });
});

describe("extractCount", () => {
  it("reads the scalar out of PostHog's row-of-rows shape", () => {
    expect(extractCount({ results: [[42]] })).toBe(42);
  });

  it("tolerates a flat row", () => {
    expect(extractCount({ results: [42] })).toBe(42);
  });

  it("returns null rather than throwing on unexpected shapes", () => {
    expect(extractCount({ results: [] })).toBeNull();
    expect(extractCount({})).toBeNull();
    expect(extractCount(null)).toBeNull();
    expect(extractCount({ results: [["not-a-number"]] })).toBeNull();
  });
});

describe("readHealthConfig", () => {
  it("returns null when the personal API key is absent", () => {
    expect(readHealthConfig({})).toBeNull();
    expect(readHealthConfig({ POSTHOG_PERSONAL_API_KEY: "   " })).toBeNull();
  });

  it("defaults project and host to the live project", () => {
    const cfg = readHealthConfig({ POSTHOG_PERSONAL_API_KEY: "phx_abc" });

    expect(cfg).not.toBeNull();
    expect(cfg!.projectId).toBe("244679");
    expect(cfg!.apiHost).toBe("https://eu.posthog.com");
  });

  it("allows both to be overridden", () => {
    const cfg = readHealthConfig({
      POSTHOG_PERSONAL_API_KEY: "phx_abc",
      POSTHOG_PROJECT_ID: "999",
      POSTHOG_API_HOST: "https://us.posthog.com",
    });

    expect(cfg!.projectId).toBe("999");
    expect(cfg!.apiHost).toBe("https://us.posthog.com");
  });
});

describe("notConfiguredVerdict", () => {
  it("does not alert — an unset optional key is a gap, not an outage", () => {
    const v = notConfiguredVerdict();

    expect(v.healthy).toBe(true);
    expect(v.status).toBe("not_configured");
  });
});
