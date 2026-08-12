"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, Save } from "lucide-react";

// ── Correcting an event after it exists ──────────────────────────────────────
//
// admin_update_event has been fully implemented for a while — name, start, end,
// doors, venue, address, support phone, terms — and NOTHING called it. The only
// actions the events screen ever sent were publish and delete, so a typo'd name,
// a moved date or a wrong venue could not be fixed at all; the create form asked
// for three fields and the rest were unreachable forever.
//
// Two more things this fixes, both of which had the same shape (the column
// existed, the reads existed, no write existed):
//  · stores.cover_url — the event hero, the /events card, the homepage tile and
//    the OpenGraph image all read it, and nothing in the repo ever set it.
//  · events.cancelled_at — event_phase() returns 'cancelled' and the scan screen
//    tells door staff every ticket is void, but no code path could cancel.

type Props = {
  storeId: string;
  eventName: string;
  startsAt: string;
  endsAt: string | null;
  doorsOpenAt: string | null;
  venueName: string | null;
  venueAddress: string | null;
  supportPhone: string | null;
  coverUrl: string | null;
  cancelledAt: string | null;
  onSaved: () => void;
};

/** ISO → the value a datetime-local input wants, in the browser's own zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO with the browser's offset, matching the create form. */
function toIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function EventEditPanel(p: Props) {
  const [name, setName] = useState(p.eventName);
  const [starts, setStarts] = useState(toLocalInput(p.startsAt));
  const [ends, setEnds] = useState(toLocalInput(p.endsAt));
  const [doors, setDoors] = useState(toLocalInput(p.doorsOpenAt));
  const [venue, setVenue] = useState(p.venueName ?? "");
  const [address, setAddress] = useState(p.venueAddress ?? "");
  const [phone, setPhone] = useState(p.supportPhone ?? "");
  const [cover, setCover] = useState(p.coverUrl ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function send(payload: Record<string, unknown>, ok: string) {
    setBusy(ok);
    try {
      const res = await fetch("/api/admin/events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", storeId: p.storeId, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "That didn't work.");
      toast.success(ok);
      p.onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function uploadCover(file: File) {
    setBusy("Photo saved");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Upload failed.");
      setCover(body.path as string);
      await send({ coverUrl: body.path }, "Photo saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
      setBusy(null);
    }
  }

  const cancelled = !!p.cancelledAt;
  const input =
    "w-full rounded-lg border border-white/12 bg-dark px-3 py-2 font-dm text-sm text-offwhite focus:border-yellow focus:outline-none";
  const label = "mb-1 block font-bebas text-[10px] tracking-[0.2em] text-muted";

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="font-bebas text-[11px] tracking-[0.25em] text-yellow">EDIT THIS EVENT</p>

      {/* Poster */}
      <div className="mt-3 flex items-center gap-4">
        <div className="h-16 w-28 shrink-0 overflow-hidden rounded-lg border border-white/12 bg-dark">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-dm text-[10px] text-muted">
              no photo
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow disabled:opacity-50"
          >
            {busy === "Photo saved" ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {cover ? "Change photo" : "Add a photo"}
          </button>
          {cover && (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => { setCover(""); void send({ coverUrl: null }, "Photo removed"); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-muted hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
            >
              <Trash2 size={12} /> Remove
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadCover(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      <p className="mt-1.5 font-dm text-[11px] text-muted">
        Shown on the event page, the tickets list, the homepage tile and when someone shares the link.
      </p>

      {/* Details */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>EVENT NAME</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className={label}>STARTS</label>
          <input className={input} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </div>
        <div>
          <label className={label}>ENDS (OPTIONAL)</label>
          <input className={input} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        </div>
        <div>
          <label className={label}>DOORS OPEN (OPTIONAL)</label>
          <input className={input} type="datetime-local" value={doors} onChange={(e) => setDoors(e.target.value)} />
        </div>
        <div>
          <label className={label}>PHONE FOR TICKET QUESTIONS</label>
          <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+230 5XXX XXXX" />
        </div>
        <div>
          <label className={label}>VENUE</label>
          <input className={input} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. Salle Polyvalente" />
        </div>
        <div>
          <label className={label}>ADDRESS</label>
          <input className={input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Port Mathurin" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!!busy || !name.trim() || !starts}
          onClick={() => {
            const startIso = toIso(starts);
            if (!startIso) return toast.error("That start date is not valid.");
            void send(
              {
                name: name.trim(),
                startsAt: startIso,
                endsAt: toIso(ends),
                doorsOpenAt: toIso(doors),
                venueName: venue.trim(),
                venueAddress: address.trim(),
                supportPhone: phone.trim(),
              },
              "Saved",
            );
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-xs font-medium text-dark hover:bg-yellow-dark disabled:opacity-50"
        >
          {busy === "Saved" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save changes
        </button>

        {/* Cancelling. Separate from Delete on purpose: a cancelled event keeps
            its orders and tickets (every ticket becomes void and the scan screen
            says so) — deleting would erase the record of who bought. */}
        {cancelled ? (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void send({ cancel: false }, "Cancellation lifted")}
            className="rounded-full border border-white/15 px-3 py-2 font-dm text-xs text-muted hover:border-green-400/50 hover:text-green-400 disabled:opacity-50"
          >
            Un-cancel
          </button>
        ) : (
          <button
            type="button"
            disabled={!!busy}
            onClick={() => {
              const why = prompt(
                "Cancel this event?\n\nEvery ticket becomes void, the event comes off the site, and the " +
                  "record of who bought is kept. Tell buyers why:",
                "",
              );
              if (why === null) return;
              void send({ cancel: true, cancelReason: why || undefined }, "Event cancelled");
            }}
            className="rounded-full border border-white/15 px-3 py-2 font-dm text-xs text-muted hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
          >
            Cancel this event
          </button>
        )}

        {cancelled && (
          <span className="font-dm text-xs text-red-300">
            Cancelled {new Date(p.cancelledAt!).toLocaleDateString("en-GB")}
          </span>
        )}
      </div>
    </div>
  );
}
