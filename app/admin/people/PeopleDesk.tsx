"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck, Bike, Building2, CheckCircle2, ChevronRight, Loader2, Mail, MoreHorizontal,
  Plus, RefreshCw, Search, ShieldOff, Store, TriangleAlert, UserCheck, UserX, X,
} from "lucide-react";
import {
  ACCOUNT_LABEL, AVAILABILITY_LABEL, BULK_ACTIONS, ONBOARDING_LABEL, VERIFICATION_LABEL,
  applyFilter, canResendInvite, computeStats, describeAction, filterFromParams, missingProfileFields,
  paginate, paramsFromFilter, whoseMove,
  type AccountState, type OnboardingState, type PeopleAction, type PeopleFilter, type PersonKind,
  type PersonRow,
} from "@/lib/admin/people";
import ConfirmAction from "./ConfirmAction";
import InvitePerson from "./InvitePerson";
import DriverWhatsappAlerts from "./DriverWhatsappAlerts";

type Detail = {
  operations: Record<string, unknown>;
  performance: Record<string, number | null>;
  activity: { id: string; action: string; at: string; diff: unknown }[];
};

const ACCOUNT_TONE: Record<AccountState, string> = {
  active: "border-green-500/30 bg-green-500/10 text-green-300",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  suspended: "border-red-500/30 bg-red-500/10 text-red-300",
  deactivated: "border-white/12 bg-white/[0.03] text-muted",
};

// The ladder is coloured by WHOSE MOVE IT IS, not by how far along it is.
// Amber is "we are waiting on them", sky is "somebody here owes them
// something", and a finished profile earns no badge at all — a row with nothing
// outstanding should be quiet.
const ONBOARDING_TONE: Record<OnboardingState, string> = {
  invited: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  activated: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  incomplete: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  awaiting_verification: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  complete: "border-white/12 bg-white/[0.03] text-muted",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-dm text-[10.5px] ${tone}`}>
      {children}
    </span>
  );
}

/** A number the desk really knows, or an honest dash. */
function Metric({ label, value, suffix }: { label: string; value: number | null | undefined; suffix?: string }) {
  const known = typeof value === "number" && Number.isFinite(value);
  return (
    <div className="rounded-xl border border-white/10 bg-dark-card px-3 py-2.5">
      <p className="font-dm text-[10.5px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-syne text-lg font-bold ${known ? "text-offwhite" : "text-muted/50"}`}>
        {known ? `${value}${suffix ?? ""}` : "—"}
      </p>
      {!known && <p className="font-dm text-[10px] text-muted/60">not measured</p>}
    </div>
  );
}

export default function PeopleDesk({ initialKind }: { initialKind: PersonKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [kind, setKind] = useState<PersonKind>(initialKind);
  const [rows, setRows] = useState<PersonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<PersonRow | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pending, setPending] = useState<{ action: PeopleAction; ids: string[]; name?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  // ── The URL is the state ──────────────────────────────────────────────────
  // A filtered view can be shared with somebody else, bookmarked, and survives
  // a reload. Keeping it in component state instead is the difference between
  // an ops tool and a demo.
  const filter = useMemo<PeopleFilter>(() => filterFromParams(params ?? new URLSearchParams()), [params]);
  const setFilter = useCallback(
    (next: Partial<PeopleFilter>) => {
      const merged = { ...filter, ...next };
      // Any change to what is being looked at returns to page one — otherwise a
      // narrower filter lands the operator on an empty page 4.
      if (!("page" in next)) merged.page = 1;
      const qs = paramsFromFilter(merged);
      if (kind !== "merchant") qs.set("kind", kind);
      router.replace(qs.toString() ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [filter, kind, pathname, router],
  );

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const res = await fetch(`/api/admin/people?kind=${kind}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load.");
        setRows([]);
        return;
      }
      setRows(json.rows as PersonRow[]);
    } catch {
      setError("Could not reach the server.");
      setRows([]);
    }
  }, [kind]);

  useEffect(() => {
    void load();
    setSelected(new Set());
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // The drawer loads its own depth, so the list stays fast.
  useEffect(() => {
    if (!open) {
      setDetail(null);
      return;
    }
    let live = true;
    setDetail(null);
    void fetch(`/api/admin/people?kind=${open.kind}&id=${open.id}`)
      .then((r) => r.json())
      .then((j) => live && setDetail(j as Detail))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  const all = rows ?? [];
  const stats = useMemo(() => computeStats(all, kind), [all, kind]);
  const filtered = useMemo(() => applyFilter(all, filter), [all, filter]);
  const { slice, pages } = useMemo(() => paginate(filtered, filter.page), [filtered, filter.page]);

  const segments = useMemo(
    () => [...new Set(all.map((r) => r.segment).filter(Boolean))].sort(),
    [all],
  );

  const switchKind = (next: PersonKind) => {
    setKind(next);
    setOpen(null);
    const qs = new URLSearchParams();
    if (next !== "merchant") qs.set("kind", next);
    router.replace(qs.toString() ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  /**
   * Send the invitation again.
   *
   * Not routed through ConfirmAction: it changes nothing, and a modal asking
   * "are you sure you want to send an email again?" trains people to click
   * through modals. The COOLDOWN is what protects the invitee, and it is
   * enforced on the server — this button only reports what the server said.
   */
  async function resendInvite(r: PersonRow) {
    if (resending) return;
    setResending(r.id);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/people/invite", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: r.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; invited?: boolean };
      if (!res.ok) {
        setActionError(data.error ?? "That invitation could not be sent again.");
        return;
      }
      setToast(
        data.invited
          ? `Invitation sent to ${r.inviteEmail}`
          : "The invitation was recorded but the email did not go out.",
      );
      await load();
    } catch {
      setActionError("Could not reach the server.");
    } finally {
      setResending(null);
    }
  }

  async function run(action: PeopleAction, ids: string[], reason: string) {
    setBusy(true);
    setActionError(null);
    try {
      const bulk = ids.length > 1;
      const res = await fetch("/api/admin/people", {
        method: bulk ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ids, action, reason }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error ?? "That did not work.");
        return;
      }
      setPending(null);
      setSelected(new Set());
      setToast(
        bulk
          ? `${json.applied} of ${ids.length} updated${json.failed?.length ? ` · ${json.failed.length} failed` : ""}`
          : describeAction(action, kind, 1).title.replace(/\?$/, "").replace(/^\w/, (c) => c.toUpperCase()) + " — done",
      );
      await load();
      if (open) setOpen(null);
    } catch {
      setActionError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const noun = kind === "merchant" ? "merchants" : "delivery partners";
  const filtersActive =
    !!filter.q || filter.account !== "all" || filter.verification !== "all" ||
    filter.segment !== "all" || filter.availability !== "all";

  return (
    <div className="space-y-4">
      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {([
          { k: "merchant" as const, label: "Merchants", Icon: Store },
          { k: "driver" as const, label: "Delivery partners", Icon: Bike },
        ]).map(({ k, label, Icon }) => (
          <button
            key={k}
            onClick={() => switchKind(k)}
            aria-current={kind === k ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-dm text-[13px] transition-colors ${
              kind === k
                ? "border-yellow/50 bg-yellow/15 text-yellow"
                : "border-white/12 text-muted hover:border-yellow/40 hover:text-offwhite"
            }`}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
        {/* Assisted onboarding. Self-service is unchanged and still how most
            people join — this is for the ones who will not fill in a form. */}
        <button
          onClick={() => { setActionError(null); setInviting(true); }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-yellow/40 bg-yellow/10 px-3.5 py-2 font-dm text-[12.5px] text-yellow hover:bg-yellow/15"
        >
          <Plus size={14} /> {kind === "merchant" ? "Add merchant" : "Add partner"}
        </button>
        <button
          onClick={() => void load()}
          aria-label="Refresh"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 text-muted hover:border-yellow/40 hover:text-yellow"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* ── Quick stats — every one a count of rows actually held ─────────── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <Metric label="Total" value={rows ? stats.total : null} />
        <Metric label="Active" value={rows ? stats.active : null} />
        <Metric label="Pending" value={rows ? stats.pending : null} />
        <Metric label="Suspended" value={rows ? stats.suspended : null} />
        <Metric label="Not signed in" value={rows ? stats.awaitingActivation : null} />
        <Metric label="Awaiting checks" value={rows ? stats.awaitingVerification : null} />
        {kind === "driver" ? (
          <Metric label="Online now" value={rows ? stats.online ?? null : null} />
        ) : (
          <Metric label="Shops open" value={rows ? stats.shopsOpen ?? null : null} />
        )}
      </div>

      {/* ── Search & filters ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={filter.q}
            onChange={(e) => setFilter({ q: e.target.value })}
            placeholder={`Search ${noun} — name, owner, email or phone`}
            className="w-full rounded-full border border-white/15 bg-dark py-2 pl-9 pr-3 font-dm text-sm text-offwhite placeholder:text-muted/50 focus:border-yellow focus:outline-none"
          />
        </div>

        <select
          value={filter.account}
          onChange={(e) => setFilter({ account: e.target.value as PeopleFilter["account"] })}
          aria-label="Account status"
          className="rounded-full border border-white/15 bg-dark px-3 py-2 font-dm text-[13px] text-offwhite focus:border-yellow focus:outline-none"
        >
          <option value="all">Any account</option>
          {(["pending", "active", "suspended", "deactivated"] as const).map((s) => (
            <option key={s} value={s}>{ACCOUNT_LABEL[s]}</option>
          ))}
        </select>

        <select
          value={filter.verification}
          onChange={(e) => setFilter({ verification: e.target.value as PeopleFilter["verification"] })}
          aria-label="Verification"
          className="rounded-full border border-white/15 bg-dark px-3 py-2 font-dm text-[13px] text-offwhite focus:border-yellow focus:outline-none"
        >
          <option value="all">Any verification</option>
          {(["unsubmitted", "submitted", "in_review", "verified", "rejected"] as const).map((s) => (
            <option key={s} value={s}>{VERIFICATION_LABEL[s]}</option>
          ))}
        </select>

        {kind === "driver" && (
          <select
            value={filter.availability}
            onChange={(e) => setFilter({ availability: e.target.value as PeopleFilter["availability"] })}
            aria-label="Availability"
            className="rounded-full border border-white/15 bg-dark px-3 py-2 font-dm text-[13px] text-offwhite focus:border-yellow focus:outline-none"
          >
            <option value="all">Any availability</option>
            <option value="available">Online</option>
            <option value="busy">On a delivery</option>
            <option value="offline">Offline</option>
          </select>
        )}

        {segments.length > 0 && (
          <select
            value={filter.segment}
            onChange={(e) => setFilter({ segment: e.target.value })}
            aria-label={kind === "merchant" ? "Category" : "Vehicle"}
            className="rounded-full border border-white/15 bg-dark px-3 py-2 font-dm text-[13px] text-offwhite focus:border-yellow focus:outline-none"
          >
            <option value="all">{kind === "merchant" ? "Any category" : "Any vehicle"}</option>
            {segments.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <select
          value={filter.onboarding}
          onChange={(e) => setFilter({ onboarding: e.target.value as PeopleFilter["onboarding"] })}
          aria-label="Joining progress"
          className="rounded-full border border-white/15 bg-dark px-3 py-2 font-dm text-[13px] text-offwhite focus:border-yellow focus:outline-none"
        >
          <option value="all">Any progress</option>
          {(Object.keys(ONBOARDING_LABEL) as OnboardingState[]).map((k) => (
            <option key={k} value={k}>{ONBOARDING_LABEL[k]}</option>
          ))}
        </select>

        <select
          value={filter.sort}
          onChange={(e) => setFilter({ sort: e.target.value as PeopleFilter["sort"] })}
          aria-label="Sort"
          className="rounded-full border border-white/15 bg-dark px-3 py-2 font-dm text-[13px] text-offwhite focus:border-yellow focus:outline-none"
        >
          <option value="recent">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">By name</option>
        </select>

        {filtersActive && (
          <button
            onClick={() => router.replace(kind === "merchant" ? pathname : `${pathname}?kind=${kind}`, { scroll: false })}
            className="inline-flex items-center gap-1 rounded-full border border-white/12 px-3 py-2 font-dm text-[12px] text-muted hover:text-offwhite"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 font-dm text-[13px] text-red-300">
          <TriangleAlert size={15} /> {error}
        </p>
      )}

      {/* ── The list ─────────────────────────────────────────────────────── */}
      {rows === null ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-xl border border-white/10 bg-dark-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-dark-card p-10 text-center">
          <p className="font-syne text-base font-bold text-offwhite">
            {filtersActive
              ? "Nobody matches those filters"
              : kind === "merchant"
                ? "No merchants yet"
                : "No delivery partners yet"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm font-dm text-[13px] text-muted">
            {filtersActive
              ? "Try widening the search, or clear the filters to see everybody."
              : kind === "merchant"
                ? "Bring your first business onto Roulé Rodrigues — merchants sign up from the partner page and appear here for approval."
                : "Drivers apply from the delivery sign-up and land here as pending. Approving one is what lets them go online."}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {slice.map((r) => {
              const checked = selected.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`rounded-xl border bg-dark-card transition-colors ${
                    checked ? "border-yellow/40" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        setSelected(next);
                      }}
                      aria-label={`Select ${r.name}`}
                      className="h-4 w-4 shrink-0 accent-yellow"
                    />

                    <button onClick={() => setOpen(r)} className="min-w-0 flex-1 text-left">
                      <p className="truncate font-syne text-sm font-bold text-offwhite">{r.name || "Unnamed"}</p>
                      <p className="truncate font-dm text-[11.5px] text-muted">
                        {[r.subtitle, r.email, r.phone].filter(Boolean).join(" · ") || "No contact details"}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={ACCOUNT_TONE[r.account]}>{ACCOUNT_LABEL[r.account]}</Badge>
                        <Badge
                          tone={
                            r.verification === "verified"
                              ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                              : "border-white/12 bg-white/[0.03] text-muted"
                          }
                        >
                          {r.verification === "verified" && <BadgeCheck size={11} className="mr-1" />}
                          {VERIFICATION_LABEL[r.verification]}
                        </Badge>
                        {r.kind === "driver" && r.availability && (
                          <Badge
                            tone={
                              r.availability === "available"
                                ? "border-green-500/30 bg-green-500/10 text-green-300"
                                : r.availability === "busy"
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                                  : "border-white/12 bg-white/[0.03] text-muted"
                            }
                          >
                            {AVAILABILITY_LABEL[r.availability]}
                          </Badge>
                        )}
                        {/* Only when something is outstanding. A finished row
                            says nothing, which is what makes the amber ones
                            findable at a glance. */}
                        {r.onboarding !== "complete" && (
                          <Badge tone={ONBOARDING_TONE[r.onboarding]}>
                            {r.onboarding === "invited" && <Mail size={11} className="mr-1" />}
                            {ONBOARDING_LABEL[r.onboarding]}
                          </Badge>
                        )}
                        {r.kind === "merchant" && (r.storesTotal ?? 0) > 0 && (
                          <Badge tone="border-white/12 bg-white/[0.03] text-muted">
                            {r.storesOpen}/{r.storesTotal} shop{r.storesTotal === 1 ? "" : "s"} open
                          </Badge>
                        )}
                      </div>
                    </button>

                    <div className="relative shrink-0">
                      <button
                        onClick={() => setMenuFor(menuFor === r.id ? null : r.id)}
                        aria-label={`Actions for ${r.name}`}
                        aria-expanded={menuFor === r.id}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted hover:border-yellow/40 hover:text-yellow"
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuFor === r.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-white/10 bg-dark-card p-1 shadow-2xl">
                            {([
                              { a: "activate" as const, label: "Activate", Icon: UserCheck, hide: r.account === "active" },
                              { a: "verify" as const, label: "Mark verified", Icon: BadgeCheck, hide: r.verification === "verified" },
                              { a: "suspend" as const, label: "Suspend", Icon: ShieldOff, hide: r.account === "suspended" },
                              { a: "deactivate" as const, label: "Deactivate", Icon: UserX, hide: r.account === "deactivated" },
                            ]).filter((i) => !i.hide).map(({ a, label, Icon }) => (
                              <button
                                key={a}
                                onClick={() => {
                                  setMenuFor(null);
                                  setActionError(null);
                                  setPending({ action: a, ids: [r.id], name: r.name });
                                }}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-dm text-[12.5px] text-offwhite hover:bg-white/[0.05]"
                              >
                                <Icon size={14} className="text-muted" /> {label}
                              </button>
                            ))}
                            {canResendInvite(r).ok && (
                              <button
                                onClick={() => { setMenuFor(null); void resendInvite(r); }}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-dm text-[12.5px] text-offwhite hover:bg-white/[0.05]"
                              >
                                <Mail size={14} className="text-muted" /> Resend invitation
                              </button>
                            )}
                            <button
                              onClick={() => { setMenuFor(null); setOpen(r); }}
                              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left font-dm text-[12.5px] text-muted hover:bg-white/[0.05]"
                            >
                              <ChevronRight size={14} /> Open profile
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                onClick={() => setFilter({ page: filter.page - 1 })}
                disabled={filter.page <= 1}
                className="rounded-full border border-white/12 px-3 py-1.5 font-dm text-[12px] text-muted disabled:opacity-30"
              >
                Previous
              </button>
              <span className="font-dm text-[12px] text-muted">
                Page {Math.min(filter.page, pages)} of {pages} · {filtered.length} {noun}
              </span>
              <button
                onClick={() => setFilter({ page: filter.page + 1 })}
                disabled={filter.page >= pages}
                className="rounded-full border border-white/12 px-3 py-1.5 font-dm text-[12px] text-muted disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Bulk bar ─────────────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="sticky bottom-3 z-30 mx-auto w-fit max-w-full">
          <div className="flex flex-wrap items-center gap-2 rounded-full border border-yellow/30 bg-dark-card/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
            <span className="font-dm text-[12.5px] text-offwhite">{selected.size} selected</span>
            {BULK_ACTIONS.map((a) => (
              <button
                key={a}
                onClick={() => { setActionError(null); setPending({ action: a, ids: [...selected] }); }}
                className="rounded-full border border-white/12 px-3 py-1.5 font-dm text-[12px] capitalize text-muted hover:border-yellow/40 hover:text-offwhite"
              >
                {a === "verify" ? "Mark verified" : a}
              </button>
            ))}
            <button
              onClick={() => setSelected(new Set())}
              aria-label="Clear selection"
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-offwhite"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Detail drawer ────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex justify-end bg-black/60 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}
        >
          <aside className="h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-dark p-5">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow/10 text-yellow">
                {open.kind === "merchant" ? <Building2 size={18} /> : <Bike size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-syne text-lg font-extrabold text-offwhite">{open.name}</h2>
                <p className="truncate font-dm text-[12px] text-muted">{open.subtitle || open.segment}</p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-muted hover:text-offwhite">
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              <Badge tone={ACCOUNT_TONE[open.account]}>{ACCOUNT_LABEL[open.account]}</Badge>
              <Badge tone="border-white/12 bg-white/[0.03] text-muted">{VERIFICATION_LABEL[open.verification]}</Badge>
              {open.availability && (
                <Badge tone="border-white/12 bg-white/[0.03] text-muted">{AVAILABILITY_LABEL[open.availability]}</Badge>
              )}
            </div>

            <dl className="mt-4 space-y-1.5 rounded-xl border border-white/10 bg-dark-card p-3">
              {[
                ["Email", open.email],
                ["Phone", open.phone],
                [open.kind === "merchant" ? "Category" : "Vehicle", open.segment],
                ["Joined", open.joinedAt ? new Date(open.joinedAt).toLocaleDateString() : ""],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="font-dm text-[11.5px] text-muted">{k}</dt>
                  <dd className="truncate font-dm text-[12.5px] text-offwhite">{v || "—"}</dd>
                </div>
              ))}
            </dl>

            {/* ── ALERTS ─────────────────────────────────────
                Drivers only. This was on the driver's own dashboard, where it
                asked somebody who had just been handed a login to message a bot
                and paste back a key. The owner onboards them by hand anyway, so
                it belongs beside their name. */}
            {open.kind === "driver" && (
              <>
                <h3 className="mt-5 font-bebas text-[11px] tracking-[0.28em] text-yellow">
                  ALERTS
                </h3>
                <DriverWhatsappAlerts
                  key={open.id}
                  driverId={open.id}
                  driverPhone={open.phone}
                />
              </>
            )}

            {/* ── JOINING ──────────────────────────────────────────────
                Shown only while something is outstanding. The point of this
                block is to answer "why is this person not working yet?" in one
                glance, and name the next action rather than a status word. */}
            {open.onboarding !== "complete" && (
              <>
                <h3 className="mt-5 font-bebas text-[11px] tracking-[0.28em] text-yellow">JOINING</h3>
                <div className="mt-2 rounded-xl border border-white/10 bg-dark-card p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={ONBOARDING_TONE[open.onboarding]}>{ONBOARDING_LABEL[open.onboarding]}</Badge>
                    <span className="font-dm text-[11.5px] text-muted">
                      {whoseMove(open.onboarding) === "them" ? "Waiting on them" : "Waiting on us"}
                    </span>
                  </div>

                  {open.onboarding === "invited" && (
                    <p className="mt-2 font-dm text-[12px] text-muted">
                      Invited{open.invitedAt ? ` on ${new Date(open.invitedAt).toLocaleDateString()}` : ""} at{" "}
                      <span className="text-offwhite">{open.inviteEmail}</span>. They have not signed in
                      yet. Nobody here can sign in for them — they choose their own password.
                    </p>
                  )}

                  {open.onboarding === "incomplete" && (
                    <div className="mt-2">
                      <p className="font-dm text-[12px] text-muted">Still missing:</p>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {missingProfileFields(open.kind, open).map((f) => (
                          <li key={f}>
                            <Badge tone="border-amber-500/30 bg-amber-500/10 text-amber-200">{f}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {open.onboarding === "activated" && (
                    <p className="mt-2 font-dm text-[12px] text-muted">
                      They have signed in and the account is theirs. It is still pending your approval
                      — signing in proves who they are, not that they are ready to trade.
                    </p>
                  )}

                  {canResendInvite(open).ok && (
                    <button
                      onClick={() => void resendInvite(open)}
                      disabled={resending === open.id}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 font-dm text-[12.5px] text-offwhite hover:border-yellow/40 disabled:opacity-50"
                    >
                      {resending === open.id ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                      Resend invitation
                    </button>
                  )}
                </div>
              </>
            )}

            <h3 className="mt-5 font-bebas text-[11px] tracking-[0.28em] text-yellow">PERFORMANCE</h3>
            {detail ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(detail.performance).map(([k, v]) => (
                  <Metric
                    key={k}
                    label={k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}
                    value={v}
                    suffix={k.endsWith("Rate") ? "%" : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-2 h-16 animate-pulse rounded-xl border border-white/10 bg-dark-card" />
            )}

            <h3 className="mt-5 font-bebas text-[11px] tracking-[0.28em] text-yellow">ACTIVITY</h3>
            {detail ? (
              detail.activity.length ? (
                <ol className="mt-2 space-y-1.5">
                  {detail.activity.map((a) => (
                    <li key={a.id} className="rounded-lg border border-white/10 bg-dark-card px-3 py-2">
                      <p className="font-dm text-[12.5px] text-offwhite">{a.action.replace(/^people\./, "").replace(/[._]/g, " ")}</p>
                      <p className="font-dm text-[11px] text-muted">{new Date(a.at).toLocaleString()}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 font-dm text-[12.5px] text-muted">
                  Nothing recorded yet. Every admin action from this desk appears here.
                </p>
              )
            ) : (
              <div className="mt-2 h-12 animate-pulse rounded-xl border border-white/10 bg-dark-card" />
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-4">
              {open.account !== "active" && (
                <button onClick={() => setPending({ action: "activate", ids: [open.id], name: open.name })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-3.5 py-2 font-dm text-[12.5px] font-semibold text-dark">
                  <CheckCircle2 size={14} /> Activate
                </button>
              )}
              {open.verification !== "verified" && (
                <button onClick={() => setPending({ action: "verify", ids: [open.id], name: open.name })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3.5 py-2 font-dm text-[12.5px] text-offwhite hover:border-yellow/40">
                  <BadgeCheck size={14} /> Mark verified
                </button>
              )}
              {open.account !== "suspended" && (
                <button onClick={() => setPending({ action: "suspend", ids: [open.id], name: open.name })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 px-3.5 py-2 font-dm text-[12.5px] text-red-300 hover:bg-red-500/10">
                  <ShieldOff size={14} /> Suspend
                </button>
              )}
            </div>
          </aside>
        </div>
      )}

      {inviting && (
        <InvitePerson
          kind={kind}
          onClose={() => setInviting(false)}
          onCreated={() => void load()}
        />
      )}

      {pending && (
        <ConfirmAction
          action={pending.action}
          kind={kind}
          count={pending.ids.length}
          entityName={pending.name}
          busy={busy}
          error={actionError}
          onCancel={() => { setPending(null); setActionError(null); }}
          onConfirm={(reason) => void run(pending.action, pending.ids, reason)}
        />
      )}

      {toast && (
        <div role="status" className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-white/12 bg-dark-card px-4 py-2 font-dm text-[12.5px] text-offwhite shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}
