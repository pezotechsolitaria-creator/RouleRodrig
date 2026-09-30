"use client";

import posthog from "posthog-js";

// ── The eSIM funnel, one event per step ──────────────────────────────────────
// view → plan chosen → email entered → paypal opened → paid → install tapped.
// Per step so the useful question — WHERE do people drop — has an answer.
// Never carries the email or anything that identifies the buyer.

type Props = Record<string, string | number | boolean | null | undefined>;

function capture(event: string, props: Props = {}) {
  try {
    posthog.capture(event, props);
  } catch {
    // Analytics must never be able to break a purchase.
  }
}

export const esimTrack = {
  viewed: (p: { plans: number; selling: boolean; lang: string }) => capture("esim_store_viewed", p),
  planChosen: (p: { plan: string; price_eur: number; badge: string | null }) => capture("esim_plan_chosen", p),
  compatChecked: (p: { query_len: number; results: number }) => capture("esim_compat_checked", p),
  checkoutStarted: (p: { plan: string; price_eur: number }) => capture("esim_checkout_started", p),
  checkoutFailed: (p: { stage: string; status: number | null }) => capture("esim_checkout_failed", p),
  paid: (p: { plan: string; price_eur: number; delivered: boolean }) => capture("esim_paid", p),
  notifyMe: (p: { plan: string | null }) => capture("esim_notify_me", p),
  installTapped: (p: { method: "apple" | "android" | "copy_code" | "copy_smdp" | "qr_shown" }) =>
    capture("esim_install_tapped", p),
};
