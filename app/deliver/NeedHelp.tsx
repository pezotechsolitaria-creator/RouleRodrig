import { MessageCircle, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { type as t } from "@/lib/delivery/tokens";

// ── The way out for somebody the form is failing ────────────────────────────
//
// A form is a wall to anyone who does not fill forms. Older customers, people
// who have never ordered anything online, anyone on a phone in bright sun —
// they do not send a bug report, they close the tab, and nothing anywhere
// records that they tried.
//
// So the escape hatch is ON the page, not buried in a footer, and it is stated
// as an EQUAL way to order rather than as a failure: "tell us and we will post
// it for you". The owner already answers this number, and a request taken by
// phone becomes the same row in the same table.
//
// Deliberately not a chat widget or a contact form. Both are more of the thing
// that already is not working. A phone number a person can tap once, and
// WhatsApp — which on this island is how people actually talk.

export default function NeedHelp({
  phone,
  whatsapp,
}: {
  phone?: string | null;
  whatsapp?: string | null;
}) {
  const tel = (phone ?? "").replace(/\s+/g, "");
  const wa = (whatsapp ?? "").replace(/\D/g, "");
  // Nothing configured means no dead buttons.
  if (!tel && !wa) return null;

  return (
    <section className="mt-10 rounded-2xl border border-white/12 bg-white/[0.03] p-5">
      <h2 className={cn(t.heading, "text-offwhite")}>Rather talk to someone?</h2>
      <p className={cn(t.body, "mt-2 text-[#B0B0B0]")}>
        Call or message us and we will post the request for you. It costs the same,
        and drivers send their prices exactly as they would here.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {tel && (
          <a
            href={`tel:${tel}`}
            // Sized for the person this is for: a big target, a real label, and
            // the NUMBER shown rather than hidden behind the word "call" — some
            // people want to dial it themselves, from a different phone.
            className="flex min-h-[60px] flex-1 items-center justify-center gap-2.5 rounded-full bg-yellow px-6 font-syne text-base font-bold text-dark"
          >
            <Phone size={19} aria-hidden />
            Call {phone}
          </a>
        )}
        {wa && (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener"
            className="flex min-h-[60px] flex-1 items-center justify-center gap-2.5 rounded-full border border-white/20 px-6 font-syne text-base font-bold text-offwhite"
          >
            <MessageCircle size={19} aria-hidden />
            WhatsApp us
          </a>
        )}
      </div>
    </section>
  );
}
