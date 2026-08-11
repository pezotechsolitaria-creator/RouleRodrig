"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, Loader2, Send, Trash2, Pencil, Check, X,
  MessageCircle, AlertTriangle, CircleCheck, CircleSlash,
} from "lucide-react";
import { NOTIFICATION_CATEGORIES, CATEGORY_LABEL, type NotificationCategory } from "@/lib/notifications/categories";

// ── WhatsApp recipients ─────────────────────────────────────────────────────
//
// Dynamic slots: the owner adds as many as they need, forever, without a
// deploy. That is the requirement this screen exists to satisfy.
//
// The API key is WRITE-ONLY. This component never receives one — only
// `hasKey` — so a credential cannot end up in devtools, a cached response or a
// screen recording. Editing shows an empty key field meaning "leave unchanged".

type Slot = {
  id: string;
  name: string;
  role: string | null;
  phone: string;
  is_active: boolean;
  categories: NotificationCategory[];
  last_success_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  hasKey: boolean;
};

type Job = {
  id: string;
  type: string;
  category: string;
  slot_id: string | null;
  status: string;
  attempts: number;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

type Draft = {
  id?: string;
  name: string;
  role: string;
  phone: string;
  apiKey: string;
  categories: NotificationCategory[];
  isActive: boolean;
};

const EMPTY: Draft = { name: "", role: "", phone: "", apiKey: "", categories: [], isActive: true };

const input =
  "w-full rounded-lg border border-dark-border bg-dark px-3 py-2 font-dm text-sm text-offwhite placeholder:text-muted/60 focus:border-yellow focus:outline-none";

export default function AdminNotifications() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notification-slots");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not load recipients.");
      setSlots(body.slots ?? []);
      setJobs(body.jobs ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load recipients.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError(null);
    try {
      const editing = Boolean(draft.id);
      const res = await fetch(editing ? `/api/admin/notification-slots/${draft.id}` : "/api/admin/notification-slots", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          role: draft.role || null,
          phone: draft.phone,
          // On edit, an empty field means "keep the stored key" — so it is only
          // sent when the admin actually typed something.
          ...(draft.apiKey || !editing ? { apiKey: draft.apiKey } : {}),
          categories: draft.categories,
          isActive: draft.isActive,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not save.");
      setDraft(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(slot: Slot) {
    if (!confirm(`Remove ${slot.name} (${slot.phone})? Queued messages for them are dropped.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/notification-slots/${slot.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(slot: Slot) {
    await fetch(`/api/admin/notification-slots/${slot.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !slot.is_active }),
    });
    await load();
  }

  async function test(slot: Slot) {
    setTesting(slot.id);
    setFlash(null);
    try {
      const res = await fetch(`/api/admin/notification-slots/${slot.id}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setFlash({
        id: slot.id,
        ok: res.ok,
        text: res.ok ? "Sent — check that phone." : body.error || "Could not send.",
      });
      await load();
    } catch {
      setFlash({ id: slot.id, ok: false, text: "Could not reach the server." });
    } finally {
      setTesting(null);
    }
  }

  function toggleCategory(c: NotificationCategory) {
    setDraft((d) =>
      d ? { ...d, categories: d.categories.includes(c) ? d.categories.filter((x) => x !== c) : [...d.categories, c] } : d,
    );
  }

  return (
    <main className="min-h-screen bg-dark px-4 py-8 text-offwhite">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="inline-flex items-center gap-1.5 font-dm text-sm text-muted hover:text-yellow">
          <ArrowLeft size={14} /> Admin
        </Link>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-bebas text-[11px] tracking-[0.3em] text-yellow">ALERTS</p>
            <h1 className="mt-1 font-syne text-2xl font-extrabold">WhatsApp recipients</h1>
            <p className="mt-1.5 font-dm text-sm text-muted">
              Who gets pinged, and for what. Add as many as you need.
            </p>
          </div>
          {!draft && (
            <button
              onClick={() => setDraft({ ...EMPTY })}
              className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-sm font-bold text-dark transition-opacity hover:opacity-90"
            >
              <Plus size={15} /> Add recipient
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 font-dm text-sm text-red-400">
            {error}
          </p>
        )}

        {/* ── Editor ─────────────────────────────────────────── */}
        {draft && (
          <div className="mt-5 rounded-2xl border border-yellow/25 bg-yellow/[0.04] p-5">
            <h2 className="font-syne text-sm font-bold text-yellow">
              {draft.id ? "Edit recipient" : "New recipient"}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="n-name" className="mb-1 block font-dm text-xs text-muted">Name</label>
                <input id="n-name" className={input} value={draft.name} placeholder="Main Admin"
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div>
                <label htmlFor="n-role" className="mb-1 block font-dm text-xs text-muted">Role (optional)</label>
                <input id="n-role" className={input} value={draft.role} placeholder="Driver Manager"
                  onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
              </div>
              <div>
                <label htmlFor="n-phone" className="mb-1 block font-dm text-xs text-muted">WhatsApp number</label>
                <input id="n-phone" className={input} value={draft.phone} placeholder="+230 5835 5588" inputMode="tel"
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
              </div>
              <div>
                <label htmlFor="n-key" className="mb-1 block font-dm text-xs text-muted">
                  CallMeBot API key {draft.id && <span className="text-muted/70">— leave blank to keep</span>}
                </label>
                <input id="n-key" className={input} value={draft.apiKey} type="password" autoComplete="off"
                  placeholder={draft.id ? "unchanged" : "123456"}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} />
              </div>
            </div>

            <fieldset className="mt-4">
              <legend className="font-dm text-xs text-muted">
                Send them — <span className="text-muted/70">nothing selected = everything</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {NOTIFICATION_CATEGORIES.map((c) => {
                  const on = draft.categories.includes(c);
                  return (
                    <button key={c} type="button" onClick={() => toggleCategory(c)} aria-pressed={on}
                      className={`rounded-full border px-3 py-1.5 font-dm text-xs font-medium transition-colors ${
                        on ? "border-yellow/60 bg-yellow/15 text-yellow" : "border-white/10 bg-dark-card text-muted hover:text-offwhite"
                      }`}>
                      {CATEGORY_LABEL[c]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={() => void save()} disabled={busy || !draft.name.trim() || !draft.phone.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-yellow px-4 py-2 font-dm text-xs font-bold text-dark disabled:opacity-40">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
              </button>
              <button onClick={() => { setDraft(null); setError(null); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2 font-dm text-xs font-bold text-offwhite">
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Slots ──────────────────────────────────────────── */}
        {loading ? (
          <p className="mt-6 flex items-center gap-2 font-dm text-sm text-muted">
            <Loader2 size={14} className="animate-spin" /> Loading recipients…
          </p>
        ) : slots.length === 0 && !draft ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-dark-card px-6 py-10 text-center">
            <MessageCircle size={26} className="mx-auto text-yellow" />
            <p className="mt-3 font-syne text-lg font-bold">No WhatsApp recipients yet</p>
            <p className="mx-auto mt-2 max-w-sm font-dm text-sm text-muted">
              Add a number to get pinged when an order comes in, a delivery needs a driver, or something breaks.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {slots.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/10 bg-dark-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-syne text-base font-bold text-offwhite">
                      {s.name} {s.role && <span className="font-dm text-xs font-normal text-muted">· {s.role}</span>}
                    </p>
                    <p className="font-dm text-sm text-muted">{s.phone}</p>
                    <p className="mt-1.5 flex items-center gap-1.5 font-dm text-xs">
                      {!s.is_active ? (
                        <span className="flex items-center gap-1 text-muted"><CircleSlash size={12} /> Disabled</span>
                      ) : !s.hasKey ? (
                        <span className="flex items-center gap-1 text-orange-300"><AlertTriangle size={12} /> No API key yet</span>
                      ) : s.last_error ? (
                        <span className="flex items-center gap-1 text-red-400"><AlertTriangle size={12} /> {s.last_error}</span>
                      ) : s.last_success_at ? (
                        <span className="flex items-center gap-1 text-green-400">
                          <CircleCheck size={12} /> Connected · last sent {new Date(s.last_success_at).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted">Never tested</span>
                      )}
                    </p>
                    <p className="mt-1 font-dm text-xs text-muted">
                      {s.categories.length === 0
                        ? "Everything"
                        : s.categories.map((c) => CATEGORY_LABEL[c]).join(" · ")}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => void test(s)} disabled={testing === s.id}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow disabled:opacity-40">
                      {testing === s.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Test
                    </button>
                    <button onClick={() => setDraft({ id: s.id, name: s.name, role: s.role ?? "", phone: s.phone, apiKey: "", categories: s.categories, isActive: s.is_active })}
                      className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow">
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => void toggleActive(s)}
                      className="rounded-full border border-white/15 px-3 py-1.5 font-dm text-xs text-offwhite hover:border-yellow/50 hover:text-yellow">
                      {s.is_active ? "Disable" : "Enable"}
                    </button>
                    <button onClick={() => void remove(s)}
                      className="inline-flex items-center gap-1 rounded-full border border-red-500/30 px-3 py-1.5 font-dm text-xs text-red-400 hover:bg-red-500/10">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>

                {flash?.id === s.id && (
                  <p role="status" className={`mt-3 font-dm text-xs ${flash.ok ? "text-green-400" : "text-red-400"}`}>
                    {flash.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Recent sends ───────────────────────────────────── */}
        {jobs.length > 0 && (
          <section className="mt-10">
            <h2 className="font-syne text-lg font-bold">Recent messages</h2>
            <p className="mt-1 font-dm text-xs text-muted">
              The queue keeps trying — a failed message here is retried, not lost.
            </p>
            <ul className="mt-3 space-y-1.5">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-1.5 font-dm text-xs">
                  <span className="text-muted">
                    {new Date(j.created_at).toLocaleString()} · {j.type}
                  </span>
                  <span className={
                    j.status === "sent" ? "text-green-400"
                    : j.status === "failed" ? "text-red-400"
                    : j.status === "pending" ? "text-orange-300" : "text-muted"
                  }>
                    {j.status}{j.attempts > 1 ? ` · ${j.attempts} tries` : ""}{j.error ? ` · ${j.error}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 rounded-2xl border border-white/10 bg-dark-card p-5">
          <p className="font-syne text-sm font-bold text-offwhite">Getting an API key</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 font-dm text-xs leading-relaxed text-muted">
            <li>Save <span className="text-offwhite">+34 644 51 95 23</span> in that phone&apos;s contacts.</li>
            <li>From that phone, send it: <span className="text-offwhite">I allow callmebot to send me messages</span></li>
            <li>It replies with an API key — paste it above.</li>
          </ol>
          <p className="mt-2 font-dm text-[11px] text-muted/70">
            Each number needs its own key, and it must be requested from that handset.
          </p>
        </div>
      </div>
    </main>
  );
}
