"use client";

import Link from "next/link";
import Image from "next/image";
import {
  InstagramIcon,
  FacebookIcon,
  TikTokIcon,
  WhatsAppIcon,
} from "@/lib/icons";
import type {
  SocialLinks,
  BrandingContent,
  LegalContent,
} from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";
import { resolveLegal, isMissing } from "@/lib/legal";
import TourismOffice from "@/components/TourismOffice";

const SOCIAL_CONFIG = [
  { key: "instagram" as const, Icon: InstagramIcon, label: "Instagram" },
  { key: "facebook" as const, Icon: FacebookIcon, label: "Facebook" },
  { key: "tiktok" as const, Icon: TikTokIcon, label: "TikTok" },
  { key: "whatsapp" as const, Icon: WhatsAppIcon, label: "WhatsApp" },
];

export default function Footer({
  social,
  branding,
  legal,
}: {
  social?: SocialLinks;
  branding?: BrandingContent;
  /**
   * The site_content legal block, so the company line shows what the owner
   * entered at /admin/legal rather than the checked-in default. Passed down
   * rather than read here because this is a client component.
   */
  legal?: LegalContent;
}) {
  const { t, language } = useLanguage();
  const LEGAL = resolveLegal(legal);
  const year = new Date().getFullYear();
  const activeSocial = SOCIAL_CONFIG.filter(({ key }) => social?.[key]);
  // Same rule as the navbar: prefer the square mark, fall back to the lockup.
  const brandImage = branding?.logoMark || branding?.logo;

  return (
    <footer
      className="bg-dark-card border-t border-dark-border"
      aria-label="Site footer"
    >
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-14 mb-8">
          {/* Brand */}
          <div>
            <Link
              href="/"
              className="flex items-center gap-2.5 mb-5"
              aria-label="Roule Rodrigues home"
            >
              {/* The MARK — h-9 is 36px, too small for the lockup's tagline. */}
              {brandImage ? (
                <Image
                  src={brandImage}
                  alt="Roule Rodrigues"
                  width={140}
                  height={40}
                  className="h-9 w-auto object-contain"
                  unoptimized={
                    brandImage.startsWith("/uploads/") ||
                    (brandImage.startsWith("http") &&
                      !brandImage.includes("supabase.co"))
                  }
                />
              ) : (
                <>
                  <span className="font-syne font-extrabold text-xl text-offwhite uppercase tracking-tight leading-none">
                    ROULE
                  </span>
                  <span className="w-px h-4 bg-dark-border" />
                  <span className="font-bebas text-sm tracking-[0.25em] text-yellow leading-none">
                    RODRIGUES
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow" />
                </>
              )}
            </Link>
            <p className="text-muted font-dm text-sm leading-relaxed max-w-[220px]">
              {t.footer.tagline}
            </p>
          </div>

          {/* Social */}
          <div>
            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-5">
              {t.footer.follow}
            </p>
            {activeSocial.length > 0 ? (
              <div className="flex gap-3 mb-6">
                {activeSocial.map(({ key, Icon, label }) => (
                  <a
                    key={key}
                    href={social![key]}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Follow us on ${label}`}
                    className="w-10 h-10 rounded-full border border-dark-border flex items-center justify-center text-muted hover:border-yellow hover:text-yellow transition-colors"
                  >
                    <Icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="flex gap-3 mb-6">
                {SOCIAL_CONFIG.map(({ Icon, label }) => (
                  <div
                    key={label}
                    className="w-10 h-10 rounded-full border border-dark-border flex items-center justify-center text-muted/30"
                    aria-hidden="true"
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                ))}
              </div>
            )}
            <p className="text-muted font-dm text-xs leading-relaxed">
              {t.footer.tag}
              <br />
              <span className="text-yellow/70">#RouleRodrigues</span>
            </p>
          </div>
        </div>

        {/* The island's real tourism office. A link, not a partnership claim
            — see the note at the top of components/TourismOffice.tsx. It sits
            here rather than on the homepage because it belongs to the layer a
            visitor reaches for when they want somebody official, and because
            anything larger on the homepage would read as an advertisement. */}
        <div className="pt-6 border-t border-dark-border mb-5">
          <TourismOffice />
        </div>

        {/* Conservation badge — Rodrigues is proudly eco-conscious */}
        <div className="pt-6 border-t border-dark-border flex justify-center mb-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-green-500/25 bg-green-500/[0.07] px-4 py-2 font-dm text-xs text-green-300/90">
            <span aria-hidden="true">🌱</span>
            {language === "fr"
              ? "Nous aimons un Rodrigues sans plastique — remportez vos déchets."
              : language === "cr"
                ? "Nou kontan enn Rodrigues san plastik — ramas ou salte."
                : "We love a plastic-free Rodrigues — please take your litter home."}
          </span>
        </div>

        {/* Working with us. The driver dashboard was reachable ONLY by typing
            the URL — an approved driver had no way back to their own jobs, and
            nobody could discover that delivering was possible at all. */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-4">
          <Link
            href="/kitchen"
            className="text-muted hover:text-yellow transition-colors text-xs font-dm"
          >
            {language === "fr"
              ? "Espace cuisine"
              : language === "cr"
                ? "Espas lakwizinn"
                : "Kitchen"}
          </Link>
          <Link
            href="/driver"
            className="text-muted hover:text-yellow transition-colors text-xs font-dm"
          >
            {language === "fr"
              ? "Espace livreur"
              : language === "cr"
                ? "Espas livrer"
                : "Driver dashboard"}
          </Link>
          {/* /partner was reachable only by typing the URL — the page that
              recruits every merchant on the platform. */}
          <Link
            href="/partner"
            className="text-muted hover:text-yellow transition-colors text-xs font-dm"
          >
            {language === "fr"
              ? "Devenir partenaire"
              : language === "cr"
                ? "Vinn partener"
                : "Sell with us"}
          </Link>
        </div>

        {/* Legal links */}
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-5">
          {[
            { label: t.footer.terms, href: "/legal/terms" },
            { label: t.footer.privacy, href: "/legal/privacy" },
            { label: t.footer.refunds, href: "/legal/refunds" },
            { label: t.footer.disclaimer, href: "/legal/disclaimer" },
            { label: t.footer.notice, href: "/legal/notice" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-muted hover:text-yellow transition-colors text-xs font-dm"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-dm text-muted">
          {/* The company line appears the moment lib/legal.ts is filled in.
              Until then it renders nothing rather than printing a placeholder
              at every customer — the Legal Notice is where the outstanding
              facts are shown honestly. */}
          <p>
            {t.footer.rights(year)}
            {!isMissing(LEGAL.legalName) && <> &middot; {LEGAL.legalName}</>}
            {!isMissing(LEGAL.brn) && <> &middot; BRN {LEGAL.brn}</>}
          </p>
          <p>{t.footer.location}</p>
        </div>
      </div>
    </footer>
  );
}
