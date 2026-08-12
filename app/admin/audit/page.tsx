import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";

// ── The audit trail ─────────────────────────────────────────────────────────
//
// Read-only, by construction: the table has no UPDATE or DELETE path from any
// application role, and this page only SELECTs. An editable audit log is a
// diary, not evidence.
//
// HONESTY ABOUT COVERAGE: the table has existed for months and recording was
// left to each route, so most never did. Writing now goes through one helper
// (lib/admin/audit.ts) and is wired into the highest-consequence actions —
// order status changes, kitchen edits, and every content save. Coverage grows
// route by route; this page states what it shows rather than implying it
// shows everything.
//
// And a limitation worth naming instead of hiding: /admin is ONE shared
// password, so "who" can only ever be "the admin session". Per-person
// attribution needs real admin accounts first — the actor column is honest
// about that rather than inventing an identity.
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const cookieStore = await cookies();
  if (!verifySession(cookieStore.get(COOKIE_NAME)?.value)) redirect("/admin/login");

  if (!hasServiceRole()) {
    return (
      <main className="min-h-screen bg-dark px-4 pb-16 pt-10 text-offwhite">
        <p className="mx-auto max-w-3xl rounded-2xl border border-orange-400/30 bg-orange-400/5 p-6 font-dm text-sm text-muted">
          The audit trail needs SUPABASE_SERVICE_ROLE_KEY, which is unset here.
        </p>
      </main>
    );
  }

  const admin = await getPrivileged();
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, actor_role, action, entity_type, entity_id, diff, created_at")
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    console.error("audit read failed", error);
    throw new Error("Could not load the audit trail.");
  }

  const rows = (data ?? []) as Record<string, unknown>[];

  return (
    <main className="min-h-screen bg-dark px-4 pb-20 pt-8 text-offwhite lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">OVERVIEW</p>
        <h1 className="mt-1 flex items-center gap-2 font-syne text-2xl font-extrabold">
          <ScrollText size={20} className="text-yellow" /> Audit trail
        </h1>
        <p className="mt-1.5 max-w-2xl font-dm text-sm text-muted">
          Administrative actions, newest first. Order status changes, kitchen and content edits are
          recorded today; coverage is growing route by route. Entries cannot be edited or deleted.
        </p>

        {rows.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center font-dm text-sm text-muted">
            Nothing recorded yet. The next admin action lands here.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03]">
                  {["When", "Actor", "Action", "Entity", "Change"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-bebas text-[10px] tracking-[0.2em] text-muted">
                      {h.toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} className="border-b border-white/5 align-top last:border-0 hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-4 py-3 font-dm text-xs tabular-nums text-muted">
                      {new Date(String(r.created_at)).toLocaleString("en-GB", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        timeZone: "Indian/Mauritius",
                      })}
                    </td>
                    <td className="px-4 py-3 font-dm text-xs text-muted">{String(r.actor_role ?? "—")}</td>
                    <td className="px-4 py-3 font-dm text-sm font-semibold text-offwhite">{String(r.action)}</td>
                    <td className="px-4 py-3 font-dm text-xs text-muted">
                      {String(r.entity_type ?? "")}
                      {r.entity_id ? <span className="block truncate opacity-70">{String(r.entity_id).slice(0, 13)}…</span> : null}
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      {r.diff ? (
                        <code className="block truncate font-mono text-[11px] text-offwhite/70">
                          {JSON.stringify(r.diff)}
                        </code>
                      ) : (
                        <span className="font-dm text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
