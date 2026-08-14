import type { Language } from "./i18n";
import { waLink } from "./wa-link";

// The opening message a traveller sends a hiking guide.
//
// Pure and separate from the component so it can be tested: this text is the
// entire handover between the website and a real conversation, and it is the
// one string on the page written in a language the guide reads rather than the
// visitor. Getting it wrong means a guide receives "hello" with no context and
// has to ask three questions before they can answer.

/**
 * The first WhatsApp message, in the visitor's language.
 *
 * Names the guide (so it does not read as a broadcast), says where they were
 * found (so the guide knows the site is sending them work), names the trail
 * when there is one, and ends with a question — a message that does not ask
 * anything is one nobody replies to.
 */
export function guideGreeting(lang: Language, who?: string, trail?: string): string {
  const name = who?.trim() ? ` ${who.trim()}` : "";
  const t = trail?.trim();

  if (lang === "fr") {
    return t
      ? `Bonjour${name} ! Je vous ai trouvé sur Roule Rodrigues. J'aimerais faire la randonnée « ${t} ». Êtes-vous disponible ?`
      : `Bonjour${name} ! Je vous ai trouvé sur Roule Rodrigues. J'aimerais faire une randonnée à Rodrigues. Êtes-vous disponible ?`;
  }
  if (lang === "cr") {
    return t
      ? `Bonzour${name} ! Mo finn trouv ou lor Roule Rodrigues. Mo anvi fer rando « ${t} ». Eski ou disponib ?`
      : `Bonzour${name} ! Mo finn trouv ou lor Roule Rodrigues. Mo anvi fer enn rando Rodrigues. Eski ou disponib ?`;
  }
  return t
    ? `Hello${name}! I found you on Roule Rodrigues. I'd like to hike "${t}". Are you available?`
    : `Hello${name}! I found you on Roule Rodrigues. I'd like to go hiking in Rodrigues. Are you available?`;
}

/**
 * The guide's contact link, or null when there is no usable number.
 *
 * Null is a real answer the caller must handle: a guide card with a dead
 * WhatsApp button is worse than one with no button, because the visitor
 * believes they have made contact.
 */
export function guideWaLink(
  whatsapp: string | null | undefined,
  lang: Language,
  who?: string,
  trail?: string,
): string | null {
  return waLink(whatsapp, guideGreeting(lang, who, trail));
}
