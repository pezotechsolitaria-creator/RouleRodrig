"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { WhatsAppIcon } from "@/lib/icons";
import { useLanguage } from "@/context/LanguageContext";
import { whatsappHref } from "@/lib/whatsapp-link";
import { useSupportContact } from "@/components/payments/SupportContact";
import {
  SECTION_TOPICS,
  TOPIC_LABEL,
  UI_COPY,
  composePaymentHelpMessage,
  defaultTopicFor,
  pick,
  safeReference,
  type PaymentMethod,
  type PaymentSection,
  type PaymentTopic,
} from "@/lib/payment-help";

// ── "NEED HELP WITH PAYMENT?" ───────────────────────────────────────────────
//
// On every screen where somebody pays. The owner's brief: a button to WhatsApp,
// "very noticeable", "premium, pro, modern". What it became:
//
//  · It sits beside the pay action, not in a footer — help you have to scroll
//    for is help nobody finds at the moment they are stuck.
//  · The customer says WHAT is wrong with one tap, and the WhatsApp message
//    arrives already written: problem, section, reference, amount, method. The
//    owner can act on it from his phone without opening the admin.
//  · It lights up by itself when something just failed (`emphasis`), with the
//    matching problem preselected — the moment somebody most needs it.
//  · It says, every time, that we never ask for card numbers or codes. A scam
//    message on this island would copy our look; the real one says this.
//  · Every tap is counted in lead_events as kind "payment_help", so the owner
//    can see WHICH payment screen confuses people most.
//
// WhatsApp's own green (#25D366) is deliberate. It is the one colour on the
// page a customer already knows means "a person will answer", and it stands
// apart from the site's yellow, which means "your action".

const WA = "#25D366";

type Props = {
  section: PaymentSection;
  /** Order number or booking reference. UUIDs are shortened, tokens dropped. */
  reference?: string | null;
  /** The shop, when there is no order yet (checkout, merchant setup). */
  shop?: string | null;
  /** The error text on screen right now, so the owner sees the same refusal. */
  detail?: string | null;
  /** ALREADY FORMATTED ("Rs 1,250"). This component never does money maths. */
  amount?: string | null;
  method?: PaymentMethod | null;
  /** Preselect a problem — e.g. "upload_failed" right after an upload fails. */
  defaultTopic?: PaymentTopic;
  /** Something just went wrong: draw the eye and preselect `defaultTopic`. */
  emphasis?: boolean;
  /** "card" beside a pay action; "compact" inside a sheet or a tight row. */
  variant?: "card" | "compact";
  className?: string;
};

function logTap(section: PaymentSection, topic: PaymentTopic, ref: string | null, linkType: "whatsapp" | "link") {
  try {
    // Fire-and-forget, keepalive so the request survives the page handing off
    // to WhatsApp. A failed log must never delay or block the help itself.
    void fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        kind: "payment_help",
        target_name: section,
        category: topic,
        // lead_events.type is HOW they were sent (whatsapp | link); the lead's
        // KIND is always "payment_help" above. Named apart on purpose — the
        // /api/leads contract test reads any `kind:` here as a lead kind.
        type: linkType,
        ref: ref ?? undefined,
      }),
    }).catch(() => {});
  } catch {
    /* logging is best-effort */
  }
}

export default function PaymentHelp({
  section,
  reference,
  shop,
  detail,
  amount,
  method,
  defaultTopic,
  emphasis = false,
  variant = "card",
  className = "",
}: Props) {
  const { language } = useLanguage();
  const { whatsapp, email } = useSupportContact();
  const topics = SECTION_TOPICS[section];
  const initial = defaultTopic && topics.includes(defaultTopic) ? defaultTopic : defaultTopicFor(section);
  const [topic, setTopic] = useState<PaymentTopic>(initial);
  const headingId = useId();

  // A failure elsewhere on the page can change the suggested problem after
  // mount (upload rejected → "My receipt won't upload"). Follow it.
  useEffect(() => {
    if (defaultTopic && topics.includes(defaultTopic)) setTopic(defaultTopic);
  }, [defaultTopic, topics]);

  const ref = safeReference(reference);
  const message = useMemo(
    () => composePaymentHelpMessage({ lang: language, section, topic, reference, shop, amount, method, detail }),
    [language, section, topic, reference, shop, amount, method, detail],
  );

  const wa = whatsappHref(whatsapp, message);
  // No WhatsApp configured: email is the fallback, never a dead button.
  const href =
    wa ??
    `mailto:${email}?subject=${encodeURIComponent(pick(UI_COPY.title, language))}&body=${encodeURIComponent(message)}`;
  const linkType: "whatsapp" | "link" = wa ? "whatsapp" : "link";
  const ctaLabel = wa ? pick(UI_COPY.cta, language) : pick(UI_COPY.ctaEmail, language);

  if (variant === "compact") {
    return (
      <a
        href={href}
        target={wa ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={() => logTap(section, topic, ref, linkType)}
        data-payment-help={section}
        className={`group inline-flex min-h-[44px] items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 font-dm text-[13px] font-semibold text-offwhite transition-colors hover:bg-[#25D366]/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] ${
          emphasis ? "border-[#25D366] bg-[#25D366]/15" : "border-[#25D366]/40 bg-[#25D366]/[0.08]"
        } ${className}`}
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ background: WA }}>
          <WhatsAppIcon className="h-4 w-4 text-[#0a0a0a]" />
        </span>
        <span>
          {pick(UI_COPY.compact, language)}{" "}
          <span className="whitespace-nowrap" style={{ color: WA }}>
            {ctaLabel}
            <ArrowUpRight size={13} className="ml-0.5 inline -translate-y-px transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </span>
        </span>
      </a>
    );
  }

  return (
    <section
      aria-labelledby={headingId}
      data-payment-help={section}
      className={`relative isolate overflow-hidden rounded-2xl border p-4 transition-shadow sm:p-5 ${
        emphasis
          ? "border-[#25D366] shadow-[0_0_0_4px_rgba(37,211,102,0.18)] motion-safe:animate-[pulse_1.2s_ease-in-out_2]"
          : "border-[#25D366]/35"
      } ${className}`}
      style={{
        background:
          "radial-gradient(120% 90% at 100% 0%, rgba(37,211,102,0.16) 0%, rgba(37,211,102,0.04) 40%, transparent 70%), #0d1310",
      }}
    >
      {/* A soft glow behind the badge — depth without a second colour. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 -z-10 h-52 w-52 rounded-full blur-3xl"
        style={{ background: "rgba(37,211,102,0.14)" }}
      />

      {/* Badge and title share a row; the body runs full width beneath. Beside
          a 48px badge the body wrapped to four lines at 375px. */}
      <div className="flex items-center gap-3">
        <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl shadow-[0_6px_20px_-6px_rgba(37,211,102,0.7)]" style={{ background: WA }}>
          <WhatsAppIcon className="h-[22px] w-[22px] text-[#0a0a0a]" />
          {/* Presence ring. It says "a way to reach a person", not "online
              now" — we make no claim about who is at the phone this minute. */}
          <span
            aria-hidden
            className="absolute inset-0 rounded-xl ring-2 ring-[#25D366]/60 motion-safe:animate-ping"
            style={{ animationDuration: "2.4s" }}
          />
        </span>
        <div className="min-w-0">
          <p className="font-bebas text-[11px] leading-none tracking-[0.28em]" style={{ color: WA }}>
            {pick(UI_COPY.eyebrow, language)}
          </p>
          <h3 id={headingId} className="mt-1 text-balance font-syne text-[17px] font-extrabold leading-tight text-offwhite sm:text-lg">
            {pick(UI_COPY.title, language)}
          </h3>
        </div>
      </div>
      <p className="mt-2.5 font-dm text-[13.5px] leading-snug text-offwhite/75">{pick(UI_COPY.body, language)}</p>

      {/* One tap names the problem, and the message is written for them.
          On a phone the chips are ONE swipeable row (the site's rr-cur-rail:
          snap, no scrollbar, the next chip peeking under a fade) — wrapped,
          they stacked one per line and took 210px. A problem is always
          preselected, so the button works without anybody choosing. */}
      <div className="mt-3.5">
        <p id={`${headingId}-pick`} className="font-dm text-[11.5px] font-semibold uppercase tracking-wide text-offwhite/55">
          {pick(UI_COPY.pick, language)}
        </p>
        <div
          role="radiogroup"
          aria-labelledby={`${headingId}-pick`}
          className="rr-cur-rail -mx-4 mt-2 flex scroll-px-4 gap-2 overflow-x-auto px-4 [mask-image:linear-gradient(to_right,black_82%,transparent)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]"
        >
          {topics.map((tp) => {
            const on = tp === topic;
            return (
              <button
                key={tp}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTopic(tp)}
                className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full border px-3.5 font-dm text-[13px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366] ${
                  on
                    ? "border-[#25D366] bg-[#25D366]/15 font-semibold text-offwhite"
                    : "border-white/12 text-offwhite/75 hover:border-white/30 hover:text-offwhite"
                }`}
              >
                {pick(TOPIC_LABEL[tp], language)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Show what will be sent. Nobody should be surprised by their own message. */}
      {(ref || amount || shop) && (
        <p className="mt-3 font-dm text-[12px] text-muted">
          {pick(UI_COPY.includes, language)}{" "}
          <span className="text-offwhite/85">
            {[shop?.trim() || null, ref, amount?.trim() || null].filter(Boolean).join(" · ")}
          </span>
        </p>
      )}

      {/* DM Sans, not Syne: at 800 weight Syne is so wide that "Chat on
          WhatsApp" broke onto two lines at 375px. The title keeps the brand
          face; the action gets the one that fits on a thumb-width button. */}
      <a
        href={href}
        target={wa ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={() => logTap(section, topic, ref, linkType)}
        className="group mt-4 flex min-h-[52px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl px-5 font-dm text-[15.5px] font-bold tracking-[-0.01em] text-[#0a0a0a] shadow-[0_10px_30px_-10px_rgba(37,211,102,0.75)] transition-[transform,filter] hover:brightness-110 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]"
        style={{ background: WA }}
      >
        <WhatsAppIcon className="h-5 w-5" />
        {ctaLabel}
        <ArrowUpRight size={17} className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
      </a>

      <p className="mt-3 flex items-start gap-1.5 font-dm text-[11.5px] leading-snug text-muted">
        <ShieldCheck size={14} className="mt-px shrink-0" style={{ color: WA }} aria-hidden />
        {pick(UI_COPY.safety, language)}
      </p>
    </section>
  );
}
