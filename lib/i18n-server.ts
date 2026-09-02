import { cookies, headers } from "next/headers";
import translations, { type Language } from "@/lib/i18n";

// ── Translation for pages that render on the server ────────────────────────
//
// The client half has had `useLanguage()` since the beginning. The server half
// had nothing, and that is why whole pages stayed English however many times
// the switcher was pressed: the language lived only in localStorage, which a
// server render cannot see. It was never a missing translation; it was a
// missing question.
//
// `context/LanguageContext.tsx` now mirrors the choice into an `rr_lang`
// cookie. This reads it.
//
// WHY NOT MIDDLEWARE. Resolving the language in middleware and passing it down
// as a header would work, and would also make every page that used it
// dynamic — including the guide pages, which are the SEO surface and are ISR
// for a reason. Reading the cookie only in the pages that actually translate
// keeps that cost where the benefit is.

const VALID: readonly Language[] = ["en", "fr", "cr"];

function parse(value: string | undefined | null): Language | null {
  const v = (value ?? "").trim().toLowerCase();
  return (VALID as readonly string[]).includes(v) ? (v as Language) : null;
}

/**
 * The visitor's language, for a server component.
 *
 * Falls back to the browser's own Accept-Language before English, so a French
 * speaker's FIRST visit is already French — the cookie only exists after
 * someone has pressed the switcher, and the most valuable moment to be
 * understood is before anyone has pressed anything.
 *
 * English on failure, never a throw: a page that cannot read a cookie must
 * still render.
 */
export async function getLanguage(): Promise<Language> {
  try {
    const fromCookie = parse((await cookies()).get("rr_lang")?.value);
    if (fromCookie) return fromCookie;
  } catch {
    /* cookies() unavailable in this context */
  }

  try {
    const accept = (await headers()).get("accept-language") ?? "";
    // Only the primary subtag, and only the first entry that we actually speak.
    // "fr-MU,fr;q=0.9,en;q=0.8" -> fr. Deliberately does NOT weigh q-values: on
    // this island the first listed language is the one people read.
    for (const part of accept.split(",")) {
      const tag = part.split(";")[0]?.trim().toLowerCase() ?? "";
      const primary = tag.split("-")[0];
      // Mauritian Creole is `mfe` in the browser; ours is `cr`.
      if (primary === "mfe" || primary === "cr") return "cr";
      const hit = parse(primary);
      if (hit) return hit;
    }
  } catch {
    /* headers() unavailable */
  }

  return "en";
}

/**
 * The dictionary for a server component, mirroring `t` from useLanguage() so a
 * string moves between a server and a client component without being rewritten.
 *
 *   const t = await getT();
 *   <h1>{t.nav.home}</h1>
 */
export async function getT(): Promise<typeof translations.en> {
  const lang = await getLanguage();
  return translations[lang] as typeof translations.en;
}

/**
 * The server twin of `loc()` — for admin-entered content carrying optional
 * `*Fr` / `*Cr` siblings rather than dictionary keys.
 */
export function locFor(lang: Language, base?: string, fr?: string, cr?: string): string {
  if (lang === "fr" && fr && fr.trim()) return fr;
  if (lang === "cr" && cr && cr.trim()) return cr;
  return base ?? "";
}
