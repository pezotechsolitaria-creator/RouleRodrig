"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Users, ScanLine, ShieldCheck, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EventStaffMember } from "@/lib/events/organizer";

// Who can get into this event, and how.
//
// TWO KINDS OF ACCESS, SAID PLAINLY. An organiser runs the event: prices,
// capacity, payments, money. Door staff scan tickets and can reach nothing else
// — not revenue, not bank details, not the buyer list. The distinction is
// enforced in the database by the role on the assignment (M59); this screen
// exists so the person granting access can SEE which one they are granting.
//
// This form can only ever create door staff. There is no role selector, because
// the endpoint has no role parameter and the RPC hard-codes it — an organiser
// cannot mint another organiser, and that is a property of the schema rather
// than of this component being careful.
export default function StaffManager({ storeId }: { storeId: string }) {
  const [staff, setStaff] = useState<EventStaffMember[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/organizer/staff?storeId=${encodeURIComponent(storeId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not load the staff list.");
      setStaff(body.staff ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load the staff list.");
      setStaff([]);
    }
  }, [storeId]);

  useEffect(() => { void load(); }, [load]);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canAdd = emailValid && name.trim().length > 0 && !adding;

  async function add() {
    setAdding(true);
    try {
      const res = await fetch("/api/organizer/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, email: email.trim(), name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not add that person.");
      toast.success(`${name.trim()} can now scan tickets`);
      setEmail(""); setName("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add that person.");
    } finally {
      setAdding(false);
    }
  }

  async function revoke(m: EventStaffMember) {
    setBusy(m.assignmentId);
    try {
      const res = await fetch("/api/organizer/staff", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, assignmentId: m.assignmentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not remove that person.");
      toast.success(`${m.name} no longer has access`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove that person.");
    } finally {
      setBusy(null);
    }
  }

  const organisers = (staff ?? []).filter((m) => m.role === "organizer");
  const door = (staff ?? []).filter((m) => m.role === "door_staff");

  return (
    <div className="rounded-2xl border border-white/10 bg-dark-card p-5">
      <h2 className="flex items-center gap-2 font-bebas text-[11px] tracking-[0.3em] text-yellow">
        <Users size={14} /> STAFF &amp; ACCESS
      </h2>
      <p className="mt-2 font-dm text-xs leading-relaxed text-muted">
        Door staff can scan tickets and nothing else — they never see sales, bank details or who
        bought what. Add whoever is working the entrance.
      </p>

      {staff === null ? (
        <p className="mt-4 flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {organisers.map((m) => (
            <Row key={m.assignmentId} member={m} />
          ))}
          {door.map((m) => (
            <Row
              key={m.assignmentId}
              member={m}
              onRevoke={() => void revoke(m)}
              revoking={busy === m.assignmentId}
            />
          ))}
          {door.length === 0 && (
            <p className="font-dm text-xs text-muted">
              Nobody is set up for the door yet.
            </p>
          )}
        </div>
      )}

      <div className="mt-5 space-y-3 border-t border-white/10 pt-4">
        <p className="font-syne text-sm font-bold text-offwhite">Add door staff</p>
        <label className="block">
          <span className="font-dm text-xs text-muted">Their name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" autoComplete="off" />
        </label>
        <label className="block">
          <span className="font-dm text-xs text-muted">Their email</span>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
            inputMode="email"
            autoComplete="off"
            aria-invalid={email.length > 0 && !emailValid}
          />
          <span className="mt-1 block font-dm text-xs text-muted">
            They sign in with this address. If they don&apos;t have an account yet, one is waiting for
            them the first time they sign in with it.
          </span>
        </label>
        <Button className="w-full" disabled={!canAdd} onClick={() => void add()}>
          {adding ? <Loader2 size={15} className="animate-spin" /> : (<><UserPlus size={15} className="mr-1.5" /> Give door access</>)}
        </Button>
      </div>
    </div>
  );
}

function Row({
  member: m, onRevoke, revoking,
}: {
  member: EventStaffMember;
  onRevoke?: () => void;
  revoking?: boolean;
}) {
  const isDoor = m.role === "door_staff";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="min-w-0">
        <p className="font-syne text-sm font-bold text-offwhite">{m.name}</p>
        <p className="truncate font-dm text-xs text-muted">{m.email}</p>
        {!m.hasSignedIn && (
          <p className="mt-0.5 flex items-center gap-1 font-dm text-[11px] text-orange-300">
            <Clock size={11} /> Invited — hasn&apos;t signed in yet
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-dm text-[11px] ${
            isDoor
              ? "border-white/15 bg-white/5 text-muted"
              : "border-yellow/30 bg-yellow/10 text-yellow"
          }`}
        >
          {isDoor ? <><ScanLine size={11} /> Scan only</> : <><ShieldCheck size={11} /> Organiser</>}
        </span>
        {onRevoke && (
          <Button size="sm" variant="outline" disabled={revoking} onClick={onRevoke} aria-label={`Remove ${m.name}`}>
            {revoking ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
          </Button>
        )}
      </div>
    </div>
  );
}
