import type { Language } from "@/lib/i18n";

/**
 * Resolve an admin-entered text for the visitor's current language.
 * Content fields keep their original (English/base) value plus OPTIONAL
 * `*Fr` / `*Cr` siblings the admin can fill in. When the chosen language has
 * no translation yet, we fall back to the base text so nothing ever goes blank.
 *
 *   loc(language, route.description, route.descriptionFr, route.descriptionCr)
 */
export function loc(lang: Language, base?: string, fr?: string, cr?: string): string {
  if (lang === "fr" && fr && fr.trim()) return fr;
  if (lang === "cr" && cr && cr.trim()) return cr;
  return base ?? "";
}
