"use client";

import Link from "next/link";
import Image from "next/image";
import { InstagramIcon, FacebookIcon, TikTokIcon, WhatsAppIcon } from "@/lib/icons";
import type { SocialLinks } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import Reveal from "./Reveal";

const SOCIAL_CONFIG = [
  { key: "instagram" as const, Icon: InstagramIcon, label: "Instagram" },
  { key: "facebook" as const, Icon: FacebookIcon, label: "Facebook" },
  { key: "tiktok" as const, Icon: TikTokIcon, label: "TikTok" },
  { key: "whatsapp" as const, Icon: WhatsAppIcon, label: "WhatsApp" },
];

const unopt = (src: string) =>
  src.startsWith("/uploads/") || (src.startsWith("http") && !src.includes("supabase.co"));

/**
 * The site footer, in this world's register.
 *
 * ── WHY IT IS NOT JUST <Footer /> ─────────────────────────────────────────
 * Same content, same links, same translations — the difference is entirely the
 * paint. Dropping the site footer in here would have put gold, `bg-dark-card`
 * and Syne at the bottom of a page built from copper, warm near-black and a
 * serif: the seam would be visible from across the room, and it is the last
 * thing a reader sees.
 *
 * ── AND WHY IT IS NOT A NEW FOOTER EITHER ─────────────────────────────────
 * Every link here exists in components/Footer.tsx and has a reason to: the
 * kitchen, the driver dashboard and the partner page were each, at some point,
 * reachable ONLY by typing a URL. Losing them on a world page would quietly
 * re-create a bug this project has already fixed. The legal four are an
 * obligation. So the LIST is copied deliberately and the STYLE is not.
 */
export default function WorldFooter({
  social,
  brandMark,
}: {
  social?: SocialLinks;
  brandMark?: string;
}) {
  const { t, language } = useLanguage();
  const year = new Date().getFullYear();
  const active = SOCIAL_CONFIG.filter(({ key }) => social?.[key]);

  // min-h-11 with the visual spacing coming from the padding rather than from
  // a row gap. The site footer sets these as 16px-tall inline links, which is
  // fine in a footer nobody is meant to hunt in — but they are still links, and
  // this page is read on a phone. The type does not change size; the box does.
  const rowLink =
    "inline-flex min-h-11 items-center px-1 font-dm text-[11.5px] transition-colors hover:opacity-100";
  const rowStyle = { color: "var(--cur-faint)" } as const;

  return (
    <Reveal>
      <footer
        aria-label="Site footer"
        className="mx-auto mt-4 w-full max-w-6xl px-5 lg:mt-10 lg:px-8"
      >
        <div className="rr-cur-rule mb-8" style={{ maxWidth: "100%" }} />

        <div className="grid gap-8 sm:grid-cols-2 lg:gap-14">
          {/* Brand */}
          <div>
            <Link href="/" className="mb-4 flex min-h-11 items-center gap-2.5" aria-label="Roule Rodrigues home">
              {brandMark ? (
                <Image
                  src={brandMark}
                  alt="Roule Rodrigues"
                  width={140}
                  height={40}
                  className="h-9 w-auto object-contain"
                  unoptimized={unopt(brandMark)}
                />
              ) : (
                <span className="flex flex-col leading-none">
                  <span
                    className="font-syne text-[15px] font-extrabold uppercase tracking-[0.06em]"
                    style={{ color: "var(--cur-ivory)" }}
                  >
                    Ti Roulé
                  </span>
                  <span
                    className="mt-1 font-dm text-[8.5px] font-medium uppercase tracking-[0.28em]"
                    style={{ color: "var(--cur-copper)" }}
                  >
                    Rodrigues
                  </span>
                </span>
              )}
            </Link>
            {/* The serif, because this is the sign-off rather than a caption. */}
            <p
              className="rr-cur-display max-w-[17rem] text-[1.05rem] leading-snug"
              style={{ color: "var(--cur-dim)" }}
            >
              {t.footer.tagline}
            </p>
          </div>

          {/* Social */}
          <div>
            <p className="rr-cur-eyebrow mb-4 text-[9px]">{t.footer.follow}</p>
            <div className="mb-5 flex gap-2.5">
              {(active.length ? active : SOCIAL_CONFIG).map(({ key, Icon, label }) => {
                const href = social?.[key];
                const cls =
                  "flex h-11 w-11 items-center justify-center rounded-full border transition-colors";
                const style = {
                  borderColor: "var(--cur-line)",
                  color: href ? "var(--cur-copper)" : "var(--cur-faint)",
                } as const;
                // An unconfigured network renders as a dimmed, non-interactive
                // circle rather than a dead link — the same choice the site
                // footer makes, and for the same reason.
                return href ? (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Follow us on ${label}`}
                    className={cls}
                    style={style}
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ) : (
                  <span key={label} aria-hidden className={cls} style={{ ...style, opacity: 0.35 }}>
                    <Icon className="h-4 w-4" />
                  </span>
                );
              })}
            </div>
            <p className="font-dm text-[12px] leading-relaxed" style={{ color: "var(--cur-faint)" }}>
              {t.footer.tag}
              <br />
              <span style={{ color: "var(--cur-peach)" }}>#RouleRodrigues</span>
            </p>
          </div>
        </div>

        {/* Rodrigues is proudly eco-conscious, and green is the one colour on
            this page that is allowed to mean something other than the brand. */}
        <div className="mt-8 flex justify-center">
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-center font-dm text-[11.5px]"
            style={{
              border: "1px solid rgba(120,190,120,0.22)",
              backgroundColor: "rgba(120,190,120,0.06)",
              color: "rgba(168,214,168,0.92)",
            }}
          >
            <span aria-hidden>🌱</span>
            {language === "fr"
              ? "Nous aimons un Rodrigues sans plastique — remportez vos déchets."
              : language === "cr"
                ? "Nou kontan enn Rodrigues san plastik — ramas ou salte."
                : "We love a plastic-free Rodrigues — please take your litter home."}
          </span>
        </div>

        {/* Working with us. Each of these was, at some point, reachable only by
            typing its URL. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4">
          <Link href="/kitchen" className={rowLink} style={rowStyle}>
            {language === "fr" ? "Espace cuisine" : language === "cr" ? "Espas lakwizinn" : "Kitchen"}
          </Link>
          <Link href="/driver" className={rowLink} style={rowStyle}>
            {language === "fr" ? "Espace livreur" : language === "cr" ? "Espas livrer" : "Driver dashboard"}
          </Link>
          <Link href="/partner" className={rowLink} style={rowStyle}>
            {language === "fr" ? "Devenir partenaire" : language === "cr" ? "Vinn partener" : "Sell with us"}
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4">
          {[
            { label: t.footer.terms, href: "/legal/terms" },
            { label: t.footer.privacy, href: "/legal/privacy" },
            { label: t.footer.refunds, href: "/legal/refunds" },
            { label: t.footer.disclaimer, href: "/legal/disclaimer" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className={rowLink} style={rowStyle}>
              {l.label}
            </Link>
          ))}
        </div>

        <div
          className="mt-6 flex flex-col items-center justify-between gap-1.5 font-dm text-[11px] sm:flex-row"
          style={{ color: "var(--cur-faint)" }}
        >
          <p>{t.footer.rights(year)}</p>
          <p>{t.footer.location}</p>
        </div>
      </footer>
    </Reveal>
  );
}
