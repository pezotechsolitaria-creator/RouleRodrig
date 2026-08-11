import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The permission model, asserted against the migrations that define it.
//
// These are not database round-trips — they are structural checks on the SQL
// that ships, aimed at the specific ways this model can be broken by a later
// edit. Each one corresponds to something that either WAS wrong during M59/M60
// or would be catastrophic if it silently became wrong:
//
//   * M59 narrowed can_manage_event() to role='organizer'. Widening it again
//     would hand every gate scanner the organiser's bank details.
//   * M59c fixed a REAL leak found by testing: organizer_my_events() queried
//     the assignment table inline and so ignored the new role, returning
//     gross_confirmed to door staff.
//   * organizer_add_door_staff() hard-codes the role. A role parameter would
//     make organiser-mints-organiser representable.
//   * The fee table has no write policy at all; writes are RPC-only, because a
//     column grant cannot restrict columns and RLS cannot either.

const ROOT = join(__dirname, "..", "..");
const MIG = join(ROOT, "supabase", "migrations");

function migration(name: string): string {
  return readFileSync(join(MIG, name), "utf8");
}

describe("event permission model", () => {
  const m59 = migration("20260811201810_m59_door_staff_role.sql");
  const m59b = migration("20260811201855_m59b_organizer_manages_door_staff.sql");
  const m59c = migration("20260811202445_m59c_close_role_unaware_revenue_leak.sql");

  it("can_manage_event excludes door staff", () => {
    // If this stops being true, door staff inherit price editing, capacity,
    // payment settings, bank details and the buyer list in one go.
    expect(m59).toMatch(/can_manage_event[\s\S]*?a\.role = 'organizer'/);
  });

  it("can_scan_event admits both roles — organisers work their own door", () => {
    expect(m59).toMatch(/can_scan_event[\s\S]*?a\.role in \('organizer', 'door_staff'\)/);
  });

  it("the door asks the door question, not the management question", () => {
    expect(m59).toMatch(/redeem_ticket[\s\S]*?can_scan_event/);
  });

  it("keeps the row lock that makes 'scan exactly once' true", () => {
    // Two scanners hitting one QR must serialise here. Losing this turns a
    // double scan into a double admission.
    expect(m59).toMatch(/redeem_ticket[\s\S]*?for update/);
  });

  it("an organiser cannot mint another organiser", () => {
    // The escalation is unrepresentable rather than checked: no role parameter
    // exists, and the inserted value is a literal.
    expect(m59b).toContain("'door_staff'");
    expect(m59b).not.toMatch(/organizer_add_door_staff\([^)]*p_role/);
  });

  it("an organiser cannot revoke a peer organiser, or reach another event", () => {
    expect(m59b).toMatch(/a\.role = 'door_staff'/);
    expect(m59b).toMatch(/a\.store_id = p_store_id/);
  });

  it("the revenue list is role-aware (the leak M59c closed)", () => {
    // Found live: a door_staff user received a row from organizer_my_events()
    // carrying gross_confirmed, because that function tests membership inline
    // instead of calling can_manage_event().
    expect(m59c).toMatch(/organizer_my_events[\s\S]*?a\.role = 'organizer'/);
    expect(m59c).toContain("gross_confirmed");
  });
});

describe("managed ticketing: the fee cannot touch ticket money", () => {
  const m60 = migration("20260811202009_m60_managed_ticketing_schema.sql");
  const m60b = migration("20260811202108_m60b_managed_ticketing_rpcs.sql");
  const m60c = migration("20260811202201_m60c_managed_ticketing_admin.sql");

  it("has no foreign key into orders, order_items or payments", () => {
    // The separation is structural: no revenue query can join to a table it
    // does not reference, so a refund cannot turn a fee into revenue.
    const refs = m60.match(/references\s+(orders|order_items|payments)\b/gi) ?? [];
    expect(refs, `fee table references ticket money: ${refs.join(", ")}`).toEqual([]);
  });

  it("asserts that separation at deploy time, not just in review", () => {
    expect(m60).toContain("the separation is broken");
  });

  it("has a read policy and no write policy — writes are RPC-only", () => {
    // Column grants are a no-op under a table grant and RLS cannot restrict
    // columns, so "platform-controlled columns" can only be true if the write
    // surface is functions.
    expect(m60).toMatch(/create policy managed_ticketing_read[\s\S]*?for select/);
    expect(m60).toContain("a write policy exists");
  });

  it("gives organisers no way to set a fee or a status", () => {
    expect(m60b).toContain("an organiser could set their own fee");
    expect(m60b).toContain("an organiser could approve themselves");
  });

  it("uses the M25 admin gate, so /admin can reach it and organisers cannot", () => {
    // is_platform_admin() alone is unreachable from /admin (cookie session,
    // service role, auth.uid() NULL) — that mistake shipped once already.
    expect(m60c).toContain("auth.uid() is not null and not is_platform_admin()");
  });

  it("does not grant admin fee functions to authenticated", () => {
    expect(m60c).toMatch(/revoke all on function public\.admin_set_managed_ticketing_fee[^;]*authenticated/);
  });

  it("freezes a percentage fee at invoicing so refunds cannot move it", () => {
    expect(m60c).toContain("invoiced_basis_cents");
    expect(m60c).toMatch(/FREEZING/);
  });

  it("ships no default price of any kind", () => {
    // The commercial terms are the owner's. A default in the schema would
    // quietly become a policy nobody chose.
    expect(m60).not.toMatch(/fee_amount_cents\s+int\s+(not null\s+)?default\s+\d/i);
    expect(m60).not.toMatch(/fee_rate_e5\s+int\s+(not null\s+)?default\s+\d/i);
    expect(m60).not.toMatch(/service_includes\s+text\s+default\s+'/i);
  });
});
