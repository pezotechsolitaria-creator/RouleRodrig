"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, PlaneTakeoff, History } from "lucide-react";
import {
  NIGHT_MODES,
  nightWindowLabel,
  returnDifference,
  rupees,
  type NightMode,
  type TransferPricing,
} from "@/lib/rides/transfer";

// ── AIRPORT TRANSFERS: THE OWNER'S PRICE LIST ───────────────────────────────
//
// M220. Everything the zone engine prices with, in one form, in rupees: the
// two zone lines, one-way and return-package fares per zone, what each extra
// passenger adds, when a group is too big to price automatically, what happens
// in the evening and at night, and Roulé's commission.
//
// Saving PUBLISHES a new version. The old one is kept, because every booked
// quote names the version it came from — that is what lets a fare be explained
// months later. So there is no "edit" here and no "delete", by design.
//
// ── TWO TIME BANDS (M221) ──────────────────────────────────────────────────
// The owner: "Keep priced by hand for true night (22:00–05:00). For the early
// evening window 17:00–21:59, apply a fixed surcharge of Rs 300 automatically
// so afternoon flights can dispatch without manual intervention. Update the
// price-list editor so both windows are configurable."
//
// So there are two identical blocks, Evening and Night, each with its own mode,
// hours and amounts. Where the owner makes them overlap, the NIGHT rule wins —
// said on the form, because it is the one thing about two windows that is not
// obvious from looking at them.

type VersionRow = {
  id: number;
  label: string;
  effective_from: string;
  created_at: string;
  one_way_zone1: number; one_way_zone2: number; one_way_zone3: number;
  return_zone1: number; return_zone2: number; return_zone3: number;
  extra_passenger_fee: number;
  night_mode: NightMode;
  night_from_hour: number;
  night_to_hour: number;
  evening_mode?: NightMode;
  evening_from_hour?: number;
  evening_to_hour?: number;
  evening_surcharge?: number;
  commission_percent: number;
  note: string | null;
};

const MODE_LABEL: Record<NightMode, string> = {
  manual: "Priced by hand — booked, held from drivers until you set the fare",
  fixed: "Fixed surcharge per trip — priced and dispatched automatically",
  multiplier: "Multiplier on the trip fare — priced and dispatched automatically",
  none: "Off — day fares apply",
};

type Band = {
  mode: NightMode;
  fromHour: string;
  toHour: string;
  surcharge: string;
  multiplier: string;
};

type Form = {
  label: string;
  zone1MaxKm: string; zone2MaxKm: string;
  oneWay: [string, string, string];
  returnEach: [string, string, string];
  extraPassengerFee: string;
  maxPricedPassengers: string;
  evening: Band;
  night: Band;
  commissionPercent: string;
  note: string;
};

const r = (minor: number) => String(minor / 100);

function formFrom(p: TransferPricing, commission: number): Form {
  return {
    label: "",
    zone1MaxKm: String(p.zone1MaxKm),
    zone2MaxKm: String(p.zone2MaxKm),
    oneWay: [r(p.oneWay[0]), r(p.oneWay[1]), r(p.oneWay[2])],
    returnEach: [r(p.returnEach[0]), r(p.returnEach[1]), r(p.returnEach[2])],
    extraPassengerFee: r(p.extraPassengerFee),
    maxPricedPassengers: String(p.maxPricedPassengers),
    // A sheet from before M221 has no evening band: shown as Off, 17–21.
    evening: {
      mode: p.eveningMode ?? "none",
      fromHour: String(p.eveningFromHour ?? 17),
      toHour: String(p.eveningToHour ?? 21),
      surcharge: r(p.eveningSurcharge ?? 0),
      multiplier: String(p.eveningMultiplier ?? 1),
    },
    night: {
      mode: p.nightMode,
      fromHour: String(p.nightFromHour),
      toHour: String(p.nightToHour),
      surcharge: r(p.nightSurcharge),
      multiplier: String(p.nightMultiplier),
    },
    commissionPercent: String(commission),
    note: "",
  };
}

const box = "w-full rounded-lg border border-white/12 bg-dark px-2.5 py-2 font-dm text-sm text-offwhite focus:border-yellow/50 focus:outline-none";
const lbl = "mb-1 block font-bebas text-[9px] tracking-[0.18em] text-muted";

/** One time band's controls. Rendered twice: Evening, then Night. */
function BandFields({
  name, band, onChange,
}: {
  name: "evening" | "night";
  band: Band;
  onChange: (b: Band) => void;
}) {
  const title = name === "evening" ? "EVENING" : "NIGHT";
  return (
    <fieldset className="mt-3 rounded-xl border border-white/10 p-3">
      <legend className="px-1 font-bebas text-[10px] tracking-[0.2em] text-muted">
        {title} · {nightWindowLabel(Number(band.fromHour) || 0, Number(band.toHour) || 0)}
      </legend>
      <div className="space-y-1.5">
        {NIGHT_MODES.map((m) => (
          <label key={m} className="flex min-h-11 items-start gap-2 font-dm text-sm text-offwhite/90">
            <input type="radio" name={`${name}-mode`} checked={band.mode === m}
              onChange={() => onChange({ ...band, mode: m })} className="mt-1 accent-yellow" />
            <span>{MODE_LABEL[m]}</span>
          </label>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>
          <span className={lbl}>FROM HOUR (0–23)</span>
          <input value={band.fromHour} onChange={(e) => onChange({ ...band, fromHour: e.target.value })}
            inputMode="numeric" className={box} />
        </label>
        <label>
          <span className={lbl}>TO HOUR, INCLUSIVE</span>
          <input value={band.toHour} onChange={(e) => onChange({ ...band, toHour: e.target.value })}
            inputMode="numeric" className={box} />
        </label>
        <label className={band.mode === "fixed" ? "" : "opacity-40"}>
          <span className={lbl}>SURCHARGE Rs / TRIP</span>
          <input value={band.surcharge} onChange={(e) => onChange({ ...band, surcharge: e.target.value })}
            inputMode="decimal" className={box} disabled={band.mode !== "fixed"} />
        </label>
        <label className={band.mode === "multiplier" ? "" : "opacity-40"}>
          <span className={lbl}>MULTIPLIER ×</span>
          <input value={band.multiplier} onChange={(e) => onChange({ ...band, multiplier: e.target.value })}
            inputMode="decimal" className={box} disabled={band.mode !== "multiplier"} />
        </label>
      </div>
      {band.mode === "manual" && (
        <p className="mt-2 font-dm text-[11px] text-orange-200">
          A booking in this window is taken, but no driver is asked until you set its fare on the
          Queue tab. You get a WhatsApp alert with “SET THE FARE” each time.
        </p>
      )}
    </fieldset>
  );
}

export default function TransferPricingPanel() {
  const [active, setActive] = useState<TransferPricing | null | undefined>(undefined);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  // A failed read and an empty table are different problems with different
  // fixes; saying "no price list" when the login merely expired would send the
  // owner looking for a missing migration.
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/transfer-pricing");
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || "Could not load the airport price list.");
      const sheet = (b.active ?? null) as TransferPricing | null;
      const rows = (b.versions ?? []) as VersionRow[];
      setActive(sheet);
      setVersions(rows);
      setLoadError(null);
      const current = rows.find((v) => v.id === sheet?.id);
      if (sheet) setF(formFrom(sheet, Number(current?.commission_percent ?? 0)));
    } catch (e) {
      setActive(null);
      setLoadError(e instanceof Error ? e.message : "Could not load the airport price list.");
    }
  }, []);

  // A fetch on mount: every setState in load() lands after an await, which the
  // rule cannot see. Same pattern as components/admin/LiveOperationsMap.tsx.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const zones = useMemo(() => {
    const out: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] };
    for (const p of active?.places ?? []) out[p.zone].push(`${p.label} (${p.roadKm} km)`);
    return out;
  }, [active]);

  async function publish() {
    if (!f) return;
    const num = (s: string) => Number(s.replace(",", "."));
    const band = (b: Band) => ({
      mode: b.mode,
      fromHour: Math.round(num(b.fromHour)),
      toHour: Math.round(num(b.toHour)),
      surcharge: num(b.surcharge || "0"),
      multiplier: num(b.multiplier || "1"),
    });
    const evening = band(f.evening);
    const night = band(f.night);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/transfer-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: f.label.trim() || `Airport zones — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
          zone1MaxKm: num(f.zone1MaxKm),
          zone2MaxKm: num(f.zone2MaxKm),
          oneWay: f.oneWay.map(num),
          returnEach: f.returnEach.map(num),
          extraPassengerFee: num(f.extraPassengerFee || "0"),
          maxPricedPassengers: Math.round(num(f.maxPricedPassengers)),
          nightMode: night.mode,
          nightFromHour: night.fromHour,
          nightToHour: night.toHour,
          nightSurcharge: night.surcharge,
          nightMultiplier: night.multiplier,
          eveningMode: evening.mode,
          eveningFromHour: evening.fromHour,
          eveningToHour: evening.toHour,
          eveningSurcharge: evening.surcharge,
          eveningMultiplier: evening.multiplier,
          commissionPercent: num(f.commissionPercent || "0"),
          note: f.note.trim() || undefined,
        }),
      });
      const b = await res.json();
      if (!res.ok) throw new Error(b.error || "Could not publish.");
      toast.success("Published — new quotes use it now. Bookings already made keep the price they were quoted.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not publish.");
    } finally {
      setBusy(false);
    }
  }

  if (active === undefined) {
    return (
      <div className="flex justify-center rounded-2xl border border-white/10 bg-dark-card py-8">
        <Loader2 className="animate-spin text-yellow" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="rounded-2xl border border-orange-400/30 bg-orange-400/[0.06] p-4 font-dm text-sm text-orange-200">
        Could not load the airport price list: {loadError}{" "}
        <button onClick={() => void load()} className="ml-1 min-h-11 underline underline-offset-4 hover:text-offwhite">
          Try again
        </button>
      </div>
    );
  }
  if (!active || !f) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 font-dm text-sm text-red-200">
        No airport price list is in force, so every airport transfer is booked with the fare left
        for you to set. Run migration M220, or ask for the launch list to be restored.
      </div>
    );
  }

  const setTriple = (key: "oneWay" | "returnEach", i: number, v: string) => {
    const next = [...f[key]] as [string, string, string];
    next[i] = v;
    setF({ ...f, [key]: next });
  };
  const z1 = f.zone1MaxKm || "?";
  const z2 = f.zone2MaxKm || "?";
  const zoneLabels = [`Zone 1 · up to ${z1} km`, `Zone 2 · over ${z1}, under ${z2} km`, `Zone 3 · ${z2} km and over`];

  // ── WHAT THE RETURN PACKAGE ACTUALLY SAVES, FROM THE BOXES ──────────────
  // The owner's decision (B): no artificial discount in Zones 1–2, so there the
  // package is only convenience. Shown live under the table so a fare typed in
  // either column says immediately whether the package still means anything.
  const minor = (s: string) => Math.round(Number(s.replace(",", ".")) * 100) || 0;
  // Signed: a return fare typed above the one-way fare says "costs MORE",
  // never "same" (and the route refuses to publish it).
  const diffs = returnDifference({
    oneWay: f.oneWay.map(minor) as [number, number, number],
    returnEach: f.returnEach.map(minor) as [number, number, number],
  });

  return (
    <section className="rounded-2xl border border-yellow/25 bg-dark-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 font-syne text-base font-bold text-offwhite">
          <PlaneTakeoff size={16} className="text-yellow" /> Airport transfers
        </h3>
        <p className="font-dm text-xs text-muted">
          In force: <span className="text-offwhite">{active.label}</span>
        </p>
      </div>
      <p className="mt-1 font-dm text-xs text-muted">
        Zones are measured by road from Plaine Corail. Fares include one passenger; each extra
        passenger adds the fee below, per trip. A return package is priced per direction.
      </p>

      {/* The fares, one row per zone — the table the owner wrote the model as. */}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[26rem] font-dm text-sm">
          <thead>
            <tr className="text-left">
              <th className={lbl}>ZONE</th>
              <th className={lbl}>ONE WAY Rs</th>
              <th className={lbl}>RETURN, EACH WAY Rs</th>
            </tr>
          </thead>
          <tbody>
            {[0, 1, 2].map((i) => (
              <tr key={i}>
                <td className="py-1 pr-2 text-xs text-offwhite/85">{zoneLabels[i]}</td>
                <td className="py-1 pr-2">
                  <input aria-label={`${zoneLabels[i]} one way, rupees`} value={f.oneWay[i]}
                    onChange={(e) => setTriple("oneWay", i, e.target.value)} inputMode="decimal" className={box} />
                </td>
                <td className="py-1">
                  <input aria-label={`${zoneLabels[i]} return each way, rupees`} value={f.returnEach[i]}
                    onChange={(e) => setTriple("returnEach", i, e.target.value)} inputMode="decimal" className={box} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-1.5 space-y-0.5 font-dm text-[11px] text-muted">
        {([0, 1, 2] as const).map((i) => (
          <li key={i}>
            Zone {i + 1} return package:{" "}
            {diffs[i] > 0 ? (
              <span className="text-offwhite">saves {rupees(diffs[i])} per trip</span>
            ) : diffs[i] < 0 ? (
              <span className="text-orange-200">
                costs {rupees(-diffs[i])} MORE per trip than one way — fix before publishing
              </span>
            ) : (
              <>same as two one-way trips — convenience only, no discount</>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>
          <span className={lbl}>ZONE 1 UP TO km</span>
          <input value={f.zone1MaxKm} onChange={(e) => setF({ ...f, zone1MaxKm: e.target.value })} inputMode="decimal" className={box} />
        </label>
        <label>
          <span className={lbl}>ZONE 3 FROM km</span>
          <input value={f.zone2MaxKm} onChange={(e) => setF({ ...f, zone2MaxKm: e.target.value })} inputMode="decimal" className={box} />
        </label>
        <label>
          <span className={lbl}>EXTRA PASSENGER Rs</span>
          <input value={f.extraPassengerFee} onChange={(e) => setF({ ...f, extraPassengerFee: e.target.value })} inputMode="decimal" className={box} />
        </label>
        <label>
          <span className={lbl}>AUTO-PRICE UP TO (PEOPLE)</span>
          <input value={f.maxPricedPassengers} onChange={(e) => setF({ ...f, maxPricedPassengers: e.target.value })} inputMode="numeric" className={box} />
        </label>
      </div>

      {/* ── EVENING, THEN NIGHT ───────────────────────────────────────── */}
      <BandFields name="evening" band={f.evening} onChange={(evening) => setF({ ...f, evening })} />
      <BandFields name="night" band={f.night} onChange={(night) => setF({ ...f, night })} />
      <p className="mt-1.5 font-dm text-[11px] text-muted">
        Hours are island time and inclusive — “to hour 21” runs to 21:59. If the two windows
        overlap, the Night rule applies to the shared hours.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label>
          <span className={lbl}>COMMISSION %</span>
          <input value={f.commissionPercent} onChange={(e) => setF({ ...f, commissionPercent: e.target.value })} inputMode="decimal" className={box} />
        </label>
        <label className="col-span-1 sm:col-span-3">
          <span className={lbl}>NAME OF THIS PRICE LIST (OPTIONAL)</span>
          <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })}
            placeholder="e.g. High season 2026" className={box} />
        </label>
      </div>
      <p className="mt-1 font-dm text-[11px] text-muted">
        {Number(f.commissionPercent) > 0
          ? `On a ${rupees(Math.round(Number(f.oneWay[2]) * 100) || 0)} Zone 3 trip the driver keeps ${rupees(Math.round(Number(f.oneWay[2]) * (100 - Number(f.commissionPercent))) || 0)} and Roulé keeps the rest.`
          : "No commission — the driver keeps the whole fare."}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button onClick={() => void publish()} disabled={busy}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-sm font-bold text-dark disabled:opacity-50">
          {busy && <Loader2 size={14} className="animate-spin" />} Publish these prices
        </button>
        <a href="/transfers" target="_blank" rel="noreferrer" className="font-dm text-xs text-muted hover:text-yellow">
          See the public page →
        </a>
      </div>

      {/* Which place is in which zone — computed by the database from the
          measured road distances, with the list in force. */}
      <details className="mt-4">
        <summary className="cursor-pointer font-dm text-xs text-muted hover:text-offwhite">
          Which places are in which zone
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {([1, 2, 3] as const).map((z) => (
            <div key={z} className="rounded-lg border border-white/10 p-2">
              <p className="font-bebas text-[10px] tracking-[0.2em] text-yellow">ZONE {z}</p>
              <p className="mt-1 font-dm text-[11px] leading-snug text-offwhite/80">
                {zones[z].length ? zones[z].join(", ") : "—"}
              </p>
            </div>
          ))}
        </div>
      </details>

      {versions.length > 1 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-dm text-xs text-muted hover:text-offwhite">
            <History size={12} className="mr-1 inline" /> Earlier price lists
          </summary>
          <ul className="mt-2 space-y-1 font-dm text-[11px] text-muted">
            {versions.map((v) => (
              <li key={v.id}>
                <span className="text-offwhite/85">{v.label}</span>
                {" · "}
                {new Date(v.effective_from).toLocaleString("en-GB", { timeZone: "Indian/Mauritius", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                {" · one way "}
                {[v.one_way_zone1, v.one_way_zone2, v.one_way_zone3].map(rupees).join(" / ")}
                {" · return "}
                {[v.return_zone1, v.return_zone2, v.return_zone3].map(rupees).join(" / ")}
                {v.evening_mode && v.evening_mode !== "none" && (
                  <>
                    {" · evening "}{v.evening_mode}
                    {v.evening_mode === "fixed" && v.evening_surcharge != null && ` +${rupees(v.evening_surcharge)}`}
                    {` ${nightWindowLabel(v.evening_from_hour ?? 17, v.evening_to_hour ?? 21)}`}
                  </>
                )}
                {" · night "}{v.night_mode} {nightWindowLabel(v.night_from_hour, v.night_to_hour)}
                {v.id === active.id && <span className="ml-1 text-yellow">(in force)</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
