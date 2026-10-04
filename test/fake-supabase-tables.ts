// ── An in-memory stand-in for the few PostgREST calls the admin routes make ──
//
// architecture review 2026-09-30, admin items 4-6. The content save, the
// categories editor and the history restore each need a privileged client, and
// none can run against the real database from a test (no service-role key, no
// network). The route tests drive the REAL handlers — the real guard, the real
// saveContent(), the real zod schemas — against this, so what is asserted is
// what the handler did to the rows, not which strings its source contains.
//
// Deliberately small: select/insert/update/upsert, eq filters, order, range,
// limit, single/maybeSingle. Column lists are ignored (whole rows come back).
// A write can be intercepted with `beforeWrite` (to simulate a second tab
// saving in the same second) or failed with `failOn`.

type Row = Record<string, unknown>;
type Err = { message: string; code?: string };

export type FakeCall = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

export type FakeDb = {
  tables: Record<string, Row[]>;
  calls: FakeCall[];
  beforeWrite?: (call: FakeCall) => void;
  failOn: { table: string; op: string; error: Err }[];
  client: { from: (table: string) => unknown };
};

let seq = 0;

export function fakeDb(initial: Record<string, Row[]> = {}): FakeDb {
  const db: FakeDb = {
    tables: JSON.parse(JSON.stringify(initial)) as Record<string, Row[]>,
    calls: [],
    failOn: [],
    client: { from: (table: string) => builder(db, table) },
  };
  return db;
}

function builder(db: FakeDb, table: string) {
  let op: "select" | "insert" | "update" | "upsert" = "select";
  let payload: unknown;
  let returning = false;
  let single: "one" | "maybe" | null = null;
  const filters: [string, unknown][] = [];
  let order: { col: string; asc: boolean } | null = null;
  let range: [number, number] | null = null;
  let limit: number | null = null;

  const run = (): { data: unknown; error: Err | null } => {
    const call: FakeCall = { table, op, payload, filters: [...filters] };
    const rows = (db.tables[table] ??= []);
    if (op !== "select") db.beforeWrite?.(call);
    db.calls.push(call);
    const fail = db.failOn.find((f) => f.table === table && f.op === op);
    if (fail) return { data: null, error: fail.error };

    // call.filters, not filters: a beforeWrite hook may add one to make a
    // write match nothing, the way RLS silently does for the anon client.
    const match = (r: Row) => call.filters.every(([c, v]) => String(r[c]) === String(v));
    let out: Row[] = [];

    if (op === "select") {
      out = rows.filter(match);
      if (order) {
        const { col, asc } = order;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (range) out = out.slice(range[0], range[1] + 1);
      if (limit != null) out = out.slice(0, limit);
    } else if (op === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
      for (const p of list) {
        const row = { id: `row-${++seq}`, created_at: new Date(Date.UTC(2026, 8, 30, 12, 0, seq)).toISOString(), ...p };
        rows.push(row);
        out.push(row);
      }
    } else if (op === "update") {
      for (const r of rows.filter(match)) {
        Object.assign(r, payload as Row);
        out.push(r);
      }
    } else if (op === "upsert") {
      const p = payload as Row;
      const existing = rows.find((r) => r.id === p.id);
      if (existing) Object.assign(existing, p);
      else rows.push({ ...p });
      out.push(existing ?? rows[rows.length - 1]);
    }

    const copy = JSON.parse(JSON.stringify(out)) as Row[];
    if (op !== "select" && !returning) return { data: null, error: null };
    if (single === "one") {
      return copy.length === 1
        ? { data: copy[0], error: null }
        : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned", code: "PGRST116" } };
    }
    if (single === "maybe") return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null };
  };

  const chain: Record<string, unknown> = {
    select: () => {
      if (op !== "select") returning = true;
      return chain;
    },
    insert: (p: unknown) => ((op = "insert"), (payload = p), chain),
    update: (p: unknown) => ((op = "update"), (payload = p), chain),
    upsert: (p: unknown) => ((op = "upsert"), (payload = p), chain),
    eq: (c: string, v: unknown) => (filters.push([c, v]), chain),
    order: (c: string, o?: { ascending?: boolean }) => ((order = { col: c, asc: o?.ascending !== false }), chain),
    range: (a: number, b: number) => ((range = [a, b]), chain),
    limit: (n: number) => ((limit = n), chain),
    single: () => ((single = "one"), chain),
    maybeSingle: () => ((single = "maybe"), chain),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      try {
        return Promise.resolve(run()).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    },
  };
  return chain;
}
