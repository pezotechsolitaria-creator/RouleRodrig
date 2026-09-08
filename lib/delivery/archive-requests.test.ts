import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ── "AUTO-ARCHIVE COMPLETED OR EXPIRED REQUESTS AFTER 30 DAYS" ──────────────
//
// Nothing ever left my_delivery_requests(). A customer who has used /deliver a
// dozen times opened their list and read a year of cancelled and delivered
// jobs above the one they were waiting on.
//
// The risk in the fix is much worse than the bug: archiving a request somebody
// is still waiting on would hide live work from the person who paid for it. So
// what these tests pin is not "it archives" — it is everything it must REFUSE
// to touch. There is no way to unit-test SQL that runs in Postgres from here,
// and the predicate was verified against the real table before this landed
// (accepted+delivered → yes, accepted+requires_admin → no, open → no), so
// these guard the rule against a later edit.

const SQL = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260908210000_m193_a_finished_request_stops_following_you.sql",
  ),
  "utf8",
);
// The migration's own comments quote the rules to explain them, so a naive
// scan matches its own explanation. Same trap as lib/island-map-seam.test.ts.
const sql = SQL.replace(/^\s*--.*$/gm, "");

describe("what the sweep refuses to touch", () => {
  it("never archives an open request", () => {
    // An open request is live work whatever its age. Expiry is
    // expire_delivery_request()'s job and it has its own sweep.
    expect(sql).toMatch(/status in \('cancelled', 'expired'\)/);
    expect(sql).not.toMatch(/status in \([^)]*'open'/);
  });

  it("refuses a request whose delivery is still moving", () => {
    // Belt and braces beside the terminal-status check: if ANY delivery on the
    // request is in flight, the request is not finished however old it looks.
    expect(sql).toMatch(/not exists \(/);
    for (const live of [
      "searching_driver",
      "assigned",
      "going_to_pickup",
      "arrived_at_pickup",
      "picked_up",
      "out_for_delivery",
      "arrived",
    ]) {
      expect(sql, `${live} is not guarded`).toContain(`'${live}'`);
    }
  });

  it("leaves anything waiting on a human alone", () => {
    // requires_admin is deliberately in NEITHER list: it is not terminal, so
    // the request never qualifies, and somebody has to look at it.
    expect(sql).not.toMatch(/'requires_admin'/);
  });

  it("archives rather than deletes", () => {
    // deliveries hang off these rows by foreign key, and they are the
    // customer's own record of money that moved. A delete would either cascade
    // into somebody's history or fail on the constraint.
    expect(sql).toMatch(/set archived_at = now\(\)/);
    expect(sql).not.toMatch(/delete\s+from\s+delivery_requests/i);
  });
});

describe("the window belongs to the owner", () => {
  it("reads the number from settings, not from a literal", () => {
    expect(sql).toMatch(/select request_archive_days into v_days/);
    expect(sql).toMatch(/make_interval\(days => v_days\)/);
  });

  it("defaults to 30 days", () => {
    expect(sql).toMatch(/request_archive_days int not null default 30/);
  });

  it("treats zero as OFF, not as archive-everything", () => {
    // The other reading empties the table on the first run.
    expect(sql).toMatch(/if v_days is null or v_days <= 0 then/);
  });

  it("cannot be set to something absurd", () => {
    expect(sql).toMatch(/request_archive_days >= 0 and request_archive_days <= 3650/);
  });
});

describe("the customer's list respects it", () => {
  it("filters archived rows out of my_delivery_requests", () => {
    expect(sql).toMatch(/r\.archived_at is null/);
  });
});

describe("it actually runs", () => {
  const CRON = readFileSync(
    join(process.cwd(), "app/api/cron/purge-documents/route.ts"),
    "utf8",
  );

  it("is called from the nightly retention pass", () => {
    // Not its own cron entry: the plan caps this project at three and all
    // three are used. A fourth in vercel.json makes every deployment be
    // rejected before it builds. lib/cron-schedule.test.ts guards the cap.
    expect(CRON).toContain("archive_old_delivery_requests");
  });

  it("cannot take the ID purge down with it", () => {
    // That one has a legal deadline behind it (Data Protection Act 2017
    // storage limitation). A failed archive is retried tomorrow; a failed
    // purge is a compliance problem.
    const at = CRON.indexOf("archive_old_delivery_requests");
    const before = CRON.slice(Math.max(0, at - 400), at);
    expect(before).toContain("try {");
  });
});
