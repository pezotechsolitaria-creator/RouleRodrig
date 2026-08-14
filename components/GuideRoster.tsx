import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Languages, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import type { RecommendedPlace } from "@/lib/defaults";
import { loc } from "@/lib/localize";
import type { Language } from "@/lib/i18n";
import { guideWaLink } from "@/lib/guide-contact";

// ── The people you hike with ────────────────────────────────────────────────
//
// A hiking guide is a PERSON, not a trail write-up. The trail is public and
// free to walk; what a visitor actually pays for is somebody who knows where
// the path goes when the grass is high after the rains, and who can say it in
// a language they speak.
//
// Contact-first by decision: the button opens WhatsApp with the guide, with a
// first message already written. That is how this island already works — the
// taxi page does exactly this, and it is what the owner asked for here. The
// full booking engine (dates, capacity, deposit) is available to these
// listings whenever he wants it, because they are ordinary service listings on
// the Stay·Eat·Do engine; nothing here forecloses it.
//
// Guides are ordinary admin content: Admin → Services desk → Hiking guide.

/** Guides come from the same content the rest of the site reads. */
export const isGuide = (p: RecommendedPlace) => p.serviceType === "hiking";

const COPY = {
  en: {
    eyebrow: "LOCAL GUIDES",
    heading: "Hike with a local guide",
    intro:
      "The trails are free to walk. A guide is who you go with — someone who grew up on these paths, knows which ones wash out after rain, and can name what you are looking at.",
    message: "Message on WhatsApp",
    all: "See all guides",
    speaks: "Speaks",
    noneTitle: "No guides listed yet",
    noneBody:
      "Local guides are being added one by one. Every trail below is written up in the meantime — distance, climb, terrain and what to carry.",
  },
  fr: {
    eyebrow: "GUIDES LOCAUX",
    heading: "Randonnez avec un guide local",
    intro:
      "Les sentiers sont libres d'accès. Le guide, c'est la personne qui vous accompagne — quelqu'un qui a grandi sur ces chemins, qui sait lesquels deviennent impraticables après la pluie, et qui sait nommer ce que vous voyez.",
    message: "Écrire sur WhatsApp",
    all: "Voir tous les guides",
    speaks: "Parle",
    noneTitle: "Aucun guide pour le moment",
    noneBody:
      "Les guides locaux arrivent un par un. En attendant, chaque sentier est décrit ci-dessous — distance, dénivelé, terrain et ce qu'il faut emporter.",
  },
  cr: {
    eyebrow: "GID LOKAL",
    heading: "Fer rando ek enn gid lokal",
    intro:
      "Bann semin lib pou marse. Gid la, li dimoun ki akonpagn ou — enn dimoun ki'nn grandi lor sa bann semin la, ki kone kisannla vinn move apre lapli, ek ki kapav dir ou ki ou pe gete.",
    message: "Ekrir lor WhatsApp",
    all: "Get tou bann gid",
    speaks: "Koz",
    noneTitle: "Pena gid ankor",
    noneBody:
      "Bann gid lokal pe azoute enn par enn. Antretan, sak semin ekrir anba — distans, montaz, teren ek ki bizin amene.",
  },
} as const;

export default function GuideRoster({
  guides,
  lang = "en",
  trailName,
  showHeading = true,
}: {
  guides: RecommendedPlace[];
  lang?: Language;
  /** Names the trail in the opening WhatsApp message when there is one. */
  trailName?: string;
  showHeading?: boolean;
}) {
  const t = COPY[lang];

  return (
    <section aria-labelledby="guides-heading">
      {showHeading && (
        <>
          <p className="font-bebas text-xs tracking-[0.3em] text-yellow">{t.eyebrow}</p>
          <h2
            id="guides-heading"
            className="mt-2 font-syne text-2xl font-bold text-offwhite md:text-3xl"
          >
            {t.heading}
          </h2>
          <p className="mt-3 max-w-2xl font-dm leading-relaxed text-muted">{t.intro}</p>
        </>
      )}

      {guides.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dark-border bg-white/[0.02] p-6">
          <p className="font-syne text-sm font-bold text-offwhite">{t.noneTitle}</p>
          <p className="mt-2 font-dm text-sm leading-relaxed text-muted">{t.noneBody}</p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {guides.map((g) => {
              // The person's name is the headline here. `providerName` is who
              // they are; `name` is what the listing is called ("Sunrise hike
              // to Mont Limon"), and a roster of services is not a roster of
              // people.
              const person = (g.providerName || "").trim();
              const listing = loc(lang, g.name, undefined, undefined).trim();
              const title = person || listing;
              const blurb = loc(lang, g.description, g.descriptionFr, g.descriptionCr).trim();
              const href = guideWaLink(g.whatsapp, lang, person, trailName);
              const photo = g.image || g.images?.[0];

              return (
                <article
                  key={g.id}
                  className={`flex flex-col overflow-hidden rounded-2xl border bg-white/[0.02] ${
                    g.featured ? "border-yellow/40" : "border-dark-border"
                  }`}
                >
                  <div className="flex items-start gap-3.5 p-4">
                    {/* A face, not a logo. Falls back to an initial rather than
                        a broken frame — a guide with no photo yet still gets a
                        card a visitor can act on. */}
                    <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-dark-card ring-1 ring-white/10">
                      {photo ? (
                        <Image src={photo} alt={title} fill sizes="64px" className="object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center font-syne text-xl font-bold text-yellow/70">
                          {title.charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <h3 className="flex items-center gap-1.5 font-syne text-base font-bold text-offwhite">
                        <span className="truncate">{title}</span>
                        {g.featured && (
                          <ShieldCheck size={14} className="shrink-0 text-yellow" aria-label="Verified by Roule Rodrigues" />
                        )}
                      </h3>
                      {person && listing && listing !== person && (
                        <p className="mt-0.5 truncate font-dm text-xs text-muted">{listing}</p>
                      )}
                      {g.languages && g.languages.length > 0 && (
                        <p className="mt-1.5 flex items-center gap-1.5 font-dm text-xs text-muted">
                          <Languages size={12} className="shrink-0 text-yellow/70" />
                          <span className="truncate">
                            {t.speaks} {g.languages.join(" · ")}
                          </span>
                        </p>
                      )}
                      {g.meetingPoint && (
                        <p className="mt-1 flex items-center gap-1.5 font-dm text-xs text-muted">
                          <MapPin size={12} className="shrink-0 text-yellow/70" />
                          <span className="truncate">{g.meetingPoint}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {blurb && (
                    <p className="px-4 font-dm text-sm leading-relaxed text-muted">{blurb}</p>
                  )}

                  {g.highlights && g.highlights.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-1.5 px-4">
                      {g.highlights.slice(0, 4).map((h) => (
                        <li
                          key={h}
                          className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-dm text-[11px] text-muted"
                        >
                          {h}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 p-4">
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-3 font-syne text-sm font-bold text-[#04310f] transition-transform hover:scale-[1.02]"
                      >
                        <MessageCircle size={16} className="shrink-0" />
                        {t.message}
                      </a>
                    ) : (
                      // No usable number saved: render no button at all rather
                      // than one that opens WhatsApp on an empty screen.
                      <span className="font-dm text-xs text-muted">
                        {g.priceNote?.trim() || ""}
                      </span>
                    )}
                    {href && g.priceNote?.trim() && (
                      <span className="font-dm text-xs text-muted">{g.priceNote.trim()}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          <Link
            href="/experiences/hiking"
            className="mt-5 inline-flex items-center gap-1.5 font-dm text-sm text-yellow/80 transition-colors hover:text-yellow"
          >
            {t.all} <ArrowRight size={14} />
          </Link>
        </>
      )}
    </section>
  );
}
