"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChefHat, Trash2, Check, Mail } from "lucide-react";

// Adding a cook to a kitchen.
//
// The API for this shipped before the screen did, which made it "unreachable
// on admin" — a capability that exists only as an endpoint is a capability
// nobody has. This is the screen.

type Staff = {
  id: string;
  store_id: string;
  invite_email: string;
  display_name: string;
  user_id: string | null;
  stores?: { name?: string } | { name?: string }[] | null;
};
type Kitchen = { store_id: string; name: string };

export default function KitchenStaffPanel() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [storeId, setStoreId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, shops] = await Promise.all([
        fetch("/api/admin/kitchen-staff", { cache: "no-store" }),
        fetch("/api/admin/stores", { cache: "no-store" }),
      ]);
      if (s.ok) setStaff(((await s.json()).staff as Staff[]) ?? []);
      else setStaff([]);
      if (shops.ok) {
        const body = await shops.json();
        // Only kitchens can have cooks — admin_add_kitchen_staff refuses
        // anything else, so offering a real merchant's shop here would just
        // produce an error the operator cannot act on.
        setKitchens(
          ((body.stores ?? []) as { store_id: string; store_name: string; is_kitchen: boolean }[])
            .filter((x) => x.is_kitchen)
            .map((x) => ({ store_id: x.store_id, name: x.store_name })),
        );
      }
    } catch {
      setStaff([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (busy || !storeId || !email.trim() || !name.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/kitchen-staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, email: email.trim(), name: name.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: "err", text: body.error ?? "Could not add that person." });
        return;
      }
      // Reported honestly: the row is written either way, but whether they were
      // TOLD is a different fact and the operator needs to know which.
      setMsg({
        kind: "ok",
        text: body.invited
          ? `${name.trim()} added and emailed an invitation.`
          : `${name.trim()} added — but the invitation email did not send. Tell them to sign up with ${email.trim()}.`,
      });
      setEmail("");
      setName("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await fetch("/api/admin/kitchen-staff", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    await load();
  }

  const shopName = (s: Staff) => {
    const st = Array.isArray(s.stores) ? s.stores[0] : s.stores;
    return st?.name ?? "Kitchen";
  };

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-dark-card p-4">
        <h2 className="flex items-center gap-2 font-syne text-base font-bold">
          <ChefHat size={16} className="text-yellow" /> Add someone to a kitchen
        </h2>
        <p className="mt-1 font-dm text-xs text-muted">
          They get one screen: today&apos;s orders and the buttons to move them along. No prices, no
          menu, no customer contact details.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            aria-label="Kitchen"
            className="min-h-[44px] rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite"
          >
            <option value="">Choose a kitchen…</option>
            {kitchens.map((k) => (
              <option key={k.store_id} value={k.store_id}>{k.name}</option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Their name"
            aria-label="Name"
            className="min-h-[44px] rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            inputMode="email"
            placeholder="Their email"
            aria-label="Email"
            className="min-h-[44px] rounded-xl border border-white/15 bg-dark px-3 font-dm text-sm text-offwhite placeholder:text-muted/60"
          />
        </div>

        <button
          onClick={() => void add()}
          disabled={busy || !storeId || !email.trim() || !name.trim()}
          className="mt-3 min-h-[44px] rounded-full bg-yellow px-5 font-syne text-sm font-bold text-dark disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="mx-auto animate-spin" /> : "Add to kitchen"}
        </button>

        {kitchens.length === 0 && (
          <p className="mt-3 font-dm text-xs text-orange-300">
            No kitchens found. A shop has to be set up as a kitchen before anyone can be added to it.
          </p>
        )}

        {msg && (
          <p className={`mt-3 flex items-start gap-1.5 font-dm text-xs ${msg.kind === "ok" ? "text-green-400" : "text-red-400"}`}>
            {msg.kind === "ok" && <Check size={13} className="mt-0.5 shrink-0" />}
            {msg.text}
          </p>
        )}
      </div>

      <h2 className="mt-6 font-bebas text-[11px] tracking-[0.3em] text-yellow">KITCHEN TEAMS</h2>
      {staff === null ? (
        <p className="mt-2 flex items-center gap-2 font-dm text-sm text-muted">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      ) : staff.length === 0 ? (
        <p className="mt-2 font-dm text-sm text-muted">Nobody added yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/5 rounded-2xl border border-white/10 bg-dark-card">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-dm text-sm text-offwhite">{s.display_name}</p>
                <p className="truncate font-dm text-xs text-muted">
                  {shopName(s)} · {s.invite_email}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Whether they have actually signed up yet — the difference
                    between "invited" and "working", which matters on a Friday. */}
                <span className={`font-dm text-[11px] ${s.user_id ? "text-green-400" : "text-muted"}`}>
                  {s.user_id ? "active" : <><Mail size={11} className="inline" /> invited</>}
                </span>
                <button
                  onClick={() => void remove(s.id)}
                  aria-label={`Remove ${s.display_name}`}
                  className="rounded-full border border-white/15 p-2 text-muted hover:border-red-500/50 hover:text-red-400"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
