"use client";

import Link from "next/link";
import Image from "next/image";
import { InstagramIcon, FacebookIcon, TikTokIcon, WhatsAppIcon } from "@/lib/icons";
import type { SocialLinks, BrandingContent } from "@/lib/defaults";
import { useLanguage } from "@/context/LanguageContext";

const SOCIAL_CONFIG = [
  { key: "instagram" as const, Icon: InstagramIcon,  label: "Instagram" },
  { key: "facebook"  as const, Icon: FacebookIcon,   label: "Facebook"  },
  { key: "tiktok"    as const, Icon: TikTokIcon,     label: "TikTok"    },
  { key: "whatsapp"  as const, Icon: WhatsAppIcon,   label: "WhatsApp"  },
];

export default function Footer({
  social,
  branding,
}: {
  social?: SocialLinks;
  branding?: BrandingContent;
}) {
  const { t } = useLanguage();
  const year = new Date().getFullYear();
  const activeSocial = SOCIAL_CONFIG.filter(({ key }) => social?.[key]);

  const navLinks = [
    { label: t.nav.scooters, href: "#fleet"    },
    { label: t.nav.booking,  href: "#booking"  },
    { label: t.nav.pricing,  href: "#pricing"  },
    { label: t.nav.map,      href: "#map"      },
    { label: t.nav.contact,  href: "#contact"  },
  ];

  return (
    <footer className="bg-dark-card border-t border-dark-border" aria-label="Site footer">
      <div className="max-w-7xl mx-auto px-6 pt-14 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16 mb-14">
          {/* Brand */}
          <div>
            <Link href="/" className="flex items-center gap-2.5 mb-5" aria-label="Roule Rodrigues home">
              {branding?.logo ? (
                <Image
                  src={branding.logo}
                  alt="Roule Rodrigues"
                  width={140}
                  height={40}
                  className="h-9 w-auto object-contain"
                  unoptimized={branding.logo.startsWith("/uploads/") || branding.logo.startsWith("http")}
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

          {/* Navigate */}
          <nav aria-label="Footer navigation">
            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-5">{t.footer.navigate}</p>
            <ul className="flex flex-col gap-3">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-muted hover:text-offwhite transition-colors text-sm font-dm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Social */}
          <div>
            <p className="font-bebas text-yellow text-[10px] tracking-[0.3em] mb-5">{t.footer.follow}</p>
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
              {t.footer.tag}<br />
              <span className="text-yellow/70">#RouleRodrigues</span>
            </p>
          </div>
        </div>

        {/* Legal links */}
        <div className="pt-6 border-t border-dark-border flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-5">
          {[
            { label: t.footer.terms,      href: "/legal/terms" },
            { label: t.footer.privacy,    href: "/legal/privacy" },
            { label: t.footer.refunds,    href: "/legal/refunds" },
            { label: t.footer.disclaimer, href: "/legal/disclaimer" },
          ].map((l) => (
            <Link key={l.href} href={l.href} className="text-muted hover:text-yellow transition-colors text-xs font-dm">
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-dm text-muted">
          <p>{t.footer.rights(year)}</p>
          <p>{t.footer.location}</p>
        </div>
      </div>
    </footer>
  );
}
