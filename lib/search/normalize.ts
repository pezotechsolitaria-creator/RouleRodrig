// ── One way to turn text into something comparable ───────────────────────────
//
// "Île aux Cocos", "ile aux coco", "ÎLE-AUX-COCOS" and "ile  aux cocos" must
// all look the same to the search. Fuse.js folds case and (with
// ignoreDiacritics) accents on its own; this does the rest the island's
// spellings need: apostrophes and hyphens become spaces ("Trou d'Argent" →
// "trou d argent"), "œ" becomes "oe", runs of spaces collapse.
//
// Used on BOTH sides — the synonym table at build time, the query at search
// time — so the two can never disagree about what a word is.

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[’'`´\-_/.,;:!?()[\]{}"«»]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Words of a normalised string. */
export function words(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}
