"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Trash2 } from "lucide-react";
import { centsToDecimalString } from "@/lib/money";

// The danger zone.
//
// Deleting a shop here removes the merchant's ACCOUNT too — the whole point of
// the feature is that the person has to sign up again from scratch — so this
// panel's job is to make sure nobody arrives at that outcome by accident, and
// nobody arrives at it uninformed.
//
// Three gates, in increasing weight:
//   1. The inventory is fetched and shown BEFORE the button is live, so the
//      admin reads what exists rather than a generic "are you sure?".
//   2. The shop's name has to be typed. Checked on the server as well, because
//      a dialog that only checks in the browser protects nobody who calls the
//      endpoint directly.
//   3. Orders still in flight refuse the first attempt outright (409). The
//      admin is shown each one — number, status, amount, customer email — and
//      has to press again to cancel and delete them.
type Account = {
  userId: string;
  email: string | null;
  role: string;
  isOwnerColumn: boolean;
  lastSignInAt: string | null;
  ordersAsCustomer: number;
  otherMerchants: number;
  isPlatformAdmin: boolean;
};

type Preview = {
  storeId: string;
  storeName: string;
  storeStatus: string;
  merchantName: string | null;
  ownerEmail: string | null;
  products: number;
  reviews: number;
  invoices: number;
  orders: number;
  ordersByStatus: Record<string, number>;
  salesTotal: number;
  accounts: Account[];
  liveOrders: { orderNumber: string; status: string; total: number; customerEmail: string | null }[];
};

export default function DeleteShopPanel({
  storeId,
  onDeleted,
}: {
  storeId: string;
  onDeleted: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which logins to remove. Pre-ticked for the ones with nothing else to lose. */
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // No setLoading(true) here — useState already starts true, and setting
    // state synchronously in an effect body triggers a cascading render.
    fetch(`/api/admin/stores/${storeId}/delete`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setError(d.error);
          return;
        }
        const p = d as Preview;
        setPreview(p);
        // Default to deleting every login whose ONLY reason to exist is this
        // shop. An account that also belongs to another merchant, or that is a
        // platform admin, starts unticked — the admin can still tick the first,
        // and the server refuses the second outright.
        setChosen(
          new Set(
            (p.accounts ?? [])
              .filter((a) => a.otherMerchants === 0 && !a.isPlatformAdmin)
              .map((a) => a.userId),
          ),
        );
      })
      .catch(() => !cancelled && setError("Could not read this shop."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  function toggle(userId: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function remove(force: boolean) {
    if (!preview || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/stores/${storeId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force, confirmName, deleteAccounts: [...chosen] }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && body.needsForce) {
        // Not an error the admin caused — it is the safety catch doing its job.
        setNeedsForce(true);
        setError(body.error);
        return;
      }
      if (!res.ok) throw new Error(body.error || "Could not delete that shop.");

      // Report what actually happened rather than a blanket success: the
      // logins and the files are separate steps that can each fail after the
      // rows are already gone, and an admin who is told "done" when the login
      // still works will find out the hard way.
      const results: { email: string | null; deleted: boolean; error?: string }[] = body.accounts ?? [];
      const gone = results.filter((a) => a.deleted);
      const failed = results.filter((a) => !a.deleted);

      toast.success(
        gone.length > 0
          ? `Shop deleted. ${gone.map((a) => a.email ?? "a login").join(", ")} must sign up again from scratch.`
          : "Shop deleted. No logins were removed.",
      );
      for (const f of failed) {
        toast.warning(
          `The login ${f.email ?? f.error ?? "?"} was NOT removed${f.error ? `: ${f.error}` : ""}. Remove it in Supabase → Authentication if you meant to.`,
        );
      }
      if (Array.isArray(body.fileErrors) && body.fileErrors.length > 0) {
        toast.warning(`Some files were left behind in storage: ${body.fileErrors.join("; ")}`);
      }
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete that shop.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 font-dm text-xs text-muted">
        <Loader2 size={12} className="animate-spin" /> Checking what this shop holds…
      </p>
    );
  }

  if (!preview) {
    return <p className="font-dm text-xs text-red-400">{error ?? "Could not read this shop."}</p>;
  }

  const nameMatches = confirmName.trim().toLowerCase() === preview.storeName.trim().toLowerCase();
  const counts = [
    `${preview.products} product${preview.products === 1 ? "" : "s"}`,
    `${preview.orders} order${preview.orders === 1 ? "" : "s"}`,
    `${preview.reviews} review${preview.reviews === 1 ? "" : "s"}`,
    `${preview.invoices} invoice${preview.invoices === 1 ? "" : "s"}`,
  ];

  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/[0.04] p-4">
      <p className="flex items-center gap-1.5 font-syne text-sm font-bold text-red-400">
        <AlertTriangle size={15} /> Delete this shop and its account
      </p>

      <p className="mt-2 font-dm text-xs leading-relaxed text-offwhite/85">
        Permanently removes <span className="font-bold">{preview.storeName}</span> and the merchant record
        {preview.merchantName ? ` (${preview.merchantName})` : ""}, plus every login you tick below. This
        cannot be undone.
      </p>

      <ul className="mt-3 space-y-1 font-dm text-xs text-muted">
        <li>· {counts.join(" · ")} will be deleted</li>
        {preview.salesTotal > 0 && (
          <li className="text-orange-300">
            · Rs {centsToDecimalString(preview.salesTotal)} of completed sales history will be erased
          </li>
        )}
        {Object.keys(preview.ordersByStatus).length > 0 && (
          <li>
            ·{" "}
            {Object.entries(preview.ordersByStatus)
              .map(([s, n]) => `${n} ${s.replace(/_/g, " ")}`)
              .join(", ")}
          </li>
        )}
      </ul>

      {/* The logins.
          merchants.owner_id and merchant_staff DRIFT — on this database the
          former was a leftover test fixture while the real person's Google
          login sat in merchant_staff. Deleting only one of them would leave
          the shop gone and the seller still able to sign in, so both are
          listed and the admin decides. */}
      <div className="mt-3">
        <p className="font-bebas text-[10px] tracking-[0.3em] text-yellow">LOGINS THAT CAN REACH THIS SHOP</p>
        {preview.accounts.length === 0 ? (
          <p className="mt-1 font-dm text-xs text-muted">None — nothing to remove.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {preview.accounts.map((a) => (
              <li key={a.userId}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={chosen.has(a.userId)}
                    disabled={a.isPlatformAdmin}
                    onChange={() => toggle(a.userId)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-red-500 disabled:opacity-40"
                  />
                  <span className="min-w-0 font-dm text-xs">
                    <span className="text-offwhite">{a.email ?? a.userId}</span>{" "}
                    <span className="text-muted">({a.role})</span>
                    <span className="block text-[11px] text-muted/80">
                      {a.lastSignInAt
                        ? `last signed in ${new Date(a.lastSignInAt).toLocaleDateString()}`
                        : "never signed in"}
                      {a.ordersAsCustomer > 0 && (
                        <span className="text-orange-300">
                          {" "}
                          · also shops here ({a.ordersAsCustomer} order
                          {a.ordersAsCustomer === 1 ? "" : "s"} become guest orders)
                        </span>
                      )}
                      {a.otherMerchants > 0 && (
                        <span className="text-orange-300"> · also runs another shop — left ticked off</span>
                      )}
                      {a.isPlatformAdmin && (
                        <span className="text-orange-300"> · platform admin, cannot be deleted here</span>
                      )}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* An audit row is written before anything is destroyed, so the fact of
          the deletion survives the data. Saying so here is what makes the
          "this cannot be undone" above honest rather than absolute. */}
      <p className="mt-2 font-dm text-[11px] text-muted/70">
        A record of exactly what was deleted is kept in the audit log.
      </p>

      {needsForce && preview.liveOrders.length > 0 && (
        <div className="mt-3 rounded-lg border border-orange-400/30 bg-orange-400/[0.06] p-3">
          <p className="font-dm text-xs font-bold text-orange-300">
            These orders are still in progress — deleting the shop deletes the customer&apos;s copy too:
          </p>
          <ul className="mt-2 space-y-1">
            {preview.liveOrders.map((o) => (
              <li key={o.orderNumber} className="flex justify-between gap-3 font-dm text-[11px]">
                <span className="text-muted">
                  {o.orderNumber} · {o.status.replace(/_/g, " ")}
                  {o.customerEmail ? ` · ${o.customerEmail}` : ""}
                </span>
                <span className="shrink-0 text-offwhite">Rs {centsToDecimalString(o.total)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 font-dm text-[11px] text-orange-200/80">
            Contact these customers first if they are real. Pressing delete again removes them.
          </p>
        </div>
      )}

      <label htmlFor="confirm-shop-name" className="mt-3 block font-dm text-xs text-muted">
        Type <span className="font-bold text-offwhite">{preview.storeName}</span> to confirm
      </label>
      <input
        id="confirm-shop-name"
        value={confirmName}
        onChange={(e) => {
          setConfirmName(e.target.value);
          setError(null);
        }}
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-red-400 focus:outline-none"
      />

      {error && !needsForce && (
        <p role="alert" className="mt-2 font-dm text-xs text-red-400">
          {error}
        </p>
      )}
      {error && needsForce && (
        <p role="alert" className="mt-2 font-dm text-xs text-orange-300">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || !nameMatches}
        onClick={() => void remove(needsForce)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-500 px-4 py-2 font-dm text-xs font-bold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
        {needsForce ? "Cancel those orders and delete everything" : "Delete shop and account"}
      </button>
    </div>
  );
}
