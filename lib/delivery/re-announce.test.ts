import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const MIGRATION = "supabase/migrations/20260908114000_m188_a_job_nobody_answered_gets_asked_again.sql";
const CLAIM = "supabase/migrations/20260908114500_m188_b_claim_stale_unanswered_requests.sql";

// ── A JOB WAS ANNOUNCED ONCE, TO THE WRONG PEOPLE ───────────────────────────
//
// notifyDriversOfNewRequest() fires exactly once, from the POST that creates
// the request, and both of its target lists filter `availability <> 'offline'`.
// So a driver who was off duty at that instant was never told, on either
// channel, ever — they could only find the job by opening the app, which is
// the behaviour of somebody already engaged rather than somebody being brought
// back. On a marketplace whose actual constraint is driver supply, that is the
// expensive kind of quiet.
//
// And the targeting had never learned the role split that driver_open_requests
// has applied since m165, while `can_run_errands` DEFAULTS TO FALSE — so an
// errand was pushed to drivers whose board would not contain it. Measured
// against the live schema: 1 push target with the flag on, 0 with it off;
// before m188 it was 1 either way.

describe("the push reaches people who can actually take the job", () => {
  it("both channels apply the role split", () => {
    const sql = read(MIGRATION);
    const roleTest =
      /case when r\.kind = 'errand' then d\.can_run_errands else d\.can_deliver end/g;
    // Once for push targets, once for WhatsApp targets. One of them alone was
    // the bug in half-fixed form.
    expect(sql.match(roleTest) ?? []).toHaveLength(2);
  });

  it("it is the same test the board uses", () => {
    // If these two ever disagree, a driver is notified about work that is not
    // on their board, or has work on their board they are never told about.
    const sql = read(MIGRATION);
    const board = read("supabase/migrations/20260908070320_m187_the_board_says_where_too.sql");
    expect(sql).toContain("can_run_errands");
    // m187 patches driver_open_requests, which carries the original test.
    expect(board).toContain("driver_open_requests");
  });
});

describe("an unanswered job gets asked about once more", () => {
  const claim = read(CLAIM);

  it("only when nobody has quoted", () => {
    // A request with a standing price does not need the board woken up; it
    // needs the customer to choose.
    expect(claim).toMatch(/not exists[\s\S]{0,140}delivery_quotes[\s\S]{0,80}'offered'/);
  });

  it("only after the first announcement had a chance", () => {
    expect(claim).toMatch(/created_at <= now\(\) - make_interval\(mins => p_minutes\)/);
  });

  it("exactly once, enforced by a column and not by a schedule", () => {
    // The worker runs every minute. Anything weaker than a stamp means the
    // same job on somebody's phone sixty times an hour.
    expect(claim).toMatch(/renotified_at is null/);
    expect(claim).toMatch(/set renotified_at = now\(\)/);
  });

  it("cannot double-send when two workers overlap", () => {
    expect(claim).toContain("for update skip locked");
  });

  it("is bounded, so a backlog is not a flood", () => {
    expect(claim).toMatch(/limit 20/);
  });

  it("takes no defaulted parameter", () => {
    // Adding a defaulted parameter to a live function creates a second
    // overload and PostgREST then refuses the endpoint with PGRST203. This
    // project has already lost an RPC that way.
    expect(claim).toMatch(/claim_stale_unanswered_requests\(p_minutes integer\)/);
    expect(claim).not.toMatch(/p_minutes integer default/i);
  });

  it("is service-role only", () => {
    expect(claim).toMatch(/revoke all on function[\s\S]{0,120}from public, anon, authenticated/);
    expect(claim).toMatch(/grant execute on function[\s\S]{0,120}to service_role/);
  });
});

describe("the worker calls it", () => {
  const route = read("app/api/cron/notifications/route.ts");

  it("rides the every-minute worker, not a new cron", () => {
    // vercel.json is at the three-cron cap and a fourth entry makes every
    // deployment fail before it builds. This one is externally pinged.
    expect(route).toContain("claim_stale_unanswered_requests");
    const vercel = read("vercel.json");
    expect(JSON.parse(vercel).crons ?? []).toHaveLength(3);
  });

  it("re-announces through the same path as the first announcement", () => {
    // Which is what makes the targeting re-evaluate at send time, and what
    // makes the push tag replace the old card instead of stacking.
    expect(route).toContain("notifyDriversOfNewRequest");
  });

  it("one failed re-announce does not abandon the rest", () => {
    // The try/catch is INSIDE the loop. Outside it, the first driver whose
    // WhatsApp key had expired would swallow every remaining job in the batch
    // — and they are all stamped already, so none would be retried.
    const loop = route.slice(route.indexOf("for (const id of ids)"));
    expect(loop.indexOf("try {")).toBeGreaterThan(-1);
    expect(loop.indexOf("try {")).toBeLessThan(loop.indexOf("re-announce failed"));
  });

  it("reports how many, so the owner can answer 'is anyone seeing my jobs?'", () => {
    expect(route).toMatch(/^\s{4}renotified,$/m);
  });
});
