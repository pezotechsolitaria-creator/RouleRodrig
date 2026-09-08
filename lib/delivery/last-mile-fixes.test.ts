import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("a dropped response cannot un-approve a driver", () => {
  const src = read("app/driver/DriverDashboard.tsx");

  it("res.json() is guarded, like act() already was", () => {
    // An edge 502, a captive portal, a carrier interception page — any non-JSON
    // reply rejected here, `dash` stayed null, and loading still cleared. The
    // render then read dash?.driver?.status as undefined and told an APPROVED
    // driver mid-shift: "Account undefined … You can't take deliveries yet."
    // With the word `undefined` in the sentence, no jobs and no button.
    const load = src.slice(src.indexOf("const load = useCallback"), src.indexOf("async function act("));
    expect(load).toMatch(/res\.json\(\)\.catch\(\(\) => null\)/);
  });

  it("a 200 that is not a dashboard is refused too", () => {
    const load = src.slice(src.indexOf("const load = useCallback"), src.indexOf("async function act("));
    expect(load).toMatch(/if \(!body \|\| typeof body !== "object"\)/);
  });
});

describe("a driver's message is not wiped before they read it", () => {
  const src = read("app/driver/DriverDashboard.tsx");

  it("the poll only clears what the poll said", () => {
    // load() called setError(null) on EVERY success and usePolling runs it
    // every twenty seconds, so RR086, a 429 and the offline notice all
    // vanished within twenty seconds whether or not anyone read them.
    expect(src).toMatch(/const errorFromAction = useRef\(false\)/);
    expect(src).toMatch(/if \(!errorFromAction\.current\) setError\(null\)/);
  });

  it("and a new action supersedes the last one", () => {
    expect(src).toMatch(/errorFromAction\.current = false;/);
  });
});

describe("watching your own delivery is not guessing at someone else's", () => {
  const src = read("app/api/delivery-requests/[id]/route.ts");

  it("the brute-force budget is charged on a MISS, not on every view", () => {
    // The tracker polls every 20s and sends whatever email is in storage, so a
    // guest burnt 3 of 8 a minute doing nothing wrong — and under CGNAT two or
    // three guests shared the bucket. The third got "Too many requests" on the
    // screen meant to tell them where their driver is.
    // The scope exists, and the old always-charged one is gone.
    expect(src).toContain('"delivery-request-guest-miss"');
    expect(src).toContain("const blocked = await guardShared(");
    expect(src).not.toMatch(/"delivery-request-guest-view"/);
  });

  it("the miss still answers NOT_FOUND either way", () => {
    // Charging after the RPC must not make this an oracle for "wrong email"
    // versus "no such request".
    const miss = src.slice(src.indexOf("delivery-request-guest-miss"));
    expect(miss.slice(0, 400)).toContain("NOT_FOUND");
  });

  it("the ID upload is keyed per request too", () => {
    // Six attempts a minute shared across a CGNAT address, for the one upload
    // that releases a cash job while a driver waits at the door.
    const idRoute = read("app/api/delivery-requests/[id]/id-document/route.ts");
    expect(idRoute).toMatch(/"delivery-id-document", 6, 60_000, id\)/);
  });
});

describe("the photo re-encode is visible", () => {
  it("both tracker uploads show progress", () => {
    // Seconds on a cheap phone with a 48 MP source, during which the button
    // still said "Choose" and the submit stayed disabled with nothing saying
    // why. PhotoInput sets its busy flag before calling shrinkImage; these did
    // not.
    const src = read("app/deliver/[id]/RequestTracker.tsx");
    expect(src.match(/setPreparing\(true\)/g) ?? []).toHaveLength(2);
    expect(src.match(/\.finally\(\(\) => setPreparing\(false\)\)/g) ?? []).toHaveLength(2);
    expect(src).toContain("c.pay.preparing");
    const copy = read("lib/delivery/copy.i18n.ts");
    expect(copy.match(/preparing:/g) ?? []).toHaveLength(3);
  });
});

describe("a second photograph of the car is not a duplicate", () => {
  const sql = read("supabase/migrations/20260908220000_m194_a_second_photo_is_not_a_duplicate.sql");

  it("a conflict appends instead of discarding", () => {
    // `do nothing` answered ok:true and dropped the new pictures. A driver who
    // re-photographs a dark or blurred shot believed they were protected and
    // were not — on the one screen whose entire purpose is evidence.
    expect(sql).toMatch(/on conflict \(request_id, event\) do update/);
    // Counted on the executable half only: the header quotes the old line
    // while explaining what it did wrong.
    const body = sql.slice(sql.indexOf("create or replace function"));
    expect(body).not.toMatch(/do nothing/);
  });

  it("only genuinely new paths are added", () => {
    expect(sql).toMatch(/where x <> all \(vehicle_custody_events\.photo_paths\)/);
  });

  it("nothing is ever removed", () => {
    // A driver may add to evidence, never replace it.
    expect(sql).toMatch(/vehicle_custody_events\.photo_paths \|\|/);
    expect(sql).toMatch(/note = coalesce\(vehicle_custody_events\.note, excluded\.note\)/);
  });

  it("it is bounded", () => {
    expect(sql).toMatch(/\[1:24\]/);
  });

  it("and it says whether anything was actually added", () => {
    expect(sql).toMatch(/'added', coalesce\(v_after, 0\) - coalesce\(v_before, 0\)/);
  });
});
