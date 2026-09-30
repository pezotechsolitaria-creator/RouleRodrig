// ── THE SENTENCE GOOGLE PRINTS, AND THE ONE WHATSAPP SHOWS ──────────────────
//
// The vehicle pages built their meta description with a bare `.slice(0, 155)`
// over the owner's own copy. Three things went wrong with that, all of them
// visible to a customer:
//
//   1. A ZERO-WIDTH SPACE survived. The Suzuki Swift served
//      `content="​Get ready to discover…"` — raw bytes `e2 80 8b` before the
//      G — because the copy was pasted from a word processor. An invisible
//      first character is not a rendering curiosity here: it is the first
//      character of the sentence in the search result.
//
//   2. It CUT MID-SENTENCE, on whatever character sat at 155. The Swift's
//      ended "…is the perfect companion for". A description that stops on a
//      preposition reads as broken, and it is the last thing somebody reads
//      before deciding whether to tap.
//
//   3. `.slice` counts UTF-16 units, and every one of these descriptions opens
//      with an emoji — a surrogate PAIR. So the budget was already wrong by a
//      character before it started, and a cut landing between the halves of a
//      pair produces a replacement glyph.
//
// This is also, per that file's own header, the text the owner pastes into
// WhatsApp. og:description and twitter:description are the same string.
//
// NOT A REWRITE. Every word is the owner's. This removes invisible characters,
// the opening emoji and list markers, turns his line breaks into sentence
// breaks (they end up inside an HTML attribute), and cuts on a sentence
// boundary instead of mid-word.

/** Zero-width space, ZWNJ, ZWJ and the BOM — all invisible, all real characters
 *  that survive a trim(). Written as escapes: pasting the literals into source
 *  would produce a file where this line looks empty. */
const INVISIBLE = /[​-‍﻿]/g;

const MAX = 155;

// ── LINES THAT WERE NEVER SENTENCES (SEO audit 2026-09-29 T5/T6) ───────────
//
// Collapsing every newline to a space welded a heading onto the sentence under
// it: the Hilux served "…Ready for Adventure Explore Rodrigues…". The
// experience listings are worse — "* Transport en bateau" bullets and a "📍"
// before every line of the Sunrise hike's itinerary. So each line is read on
// its own first: its bullet or pin goes, and a line that ends without
// punctuation ends with a full stop, unless the next one plainly continues it.

/** A list marker at the start of a line: "* ", "- ", "• ", or the 📍 pin. */
const BULLET = /^(?:[*\-•]\s+|\u{1F4CD}️?\s*)/u;

/** Emoji at the very start of the copy, with any variation selector or skin
 *  tone. "🏝️ Excursion à l'Île aux Coco" is what the snippet opened with. */
const LEADING_EMOJI = /^(?:\p{Extended_Pictographic}[️\u{1F3FB}-\u{1F3FF}]*\s*)+/u;

/** A line that already ends a sentence, or hands on to the next line (":"). */
const ENDS_CLAUSE = /[.!?…:;,—–-]["'”’)»]*$/;

function joinLines(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(BULLET, "").trim())
    .filter(Boolean);
  let out = "";
  lines.forEach((line, i) => {
    if (i === 0) {
      out = line;
      return;
    }
    // "…every corner\nof the island" is one sentence the owner wrapped by hand.
    const continues = /^\p{Ll}/u.test(line);
    out += ENDS_CLAUSE.test(out) || continues ? ` ${line}` : `. ${line}`;
  });
  return out;
}

/**
 * The owner's copy, fit to a meta description without altering his words.
 *
 * Returns "" for copy that is empty once the invisible characters are gone, so
 * the caller's existing fallback still fires.
 */
export function metaDescription(copy: string | null | undefined, max = MAX): string {
  const clean = joinLines((copy ?? "").replace(INVISIBLE, ""))
    // Whatever whitespace is left (tabs, doubled spaces) lands inside an HTML
    // attribute.
    .replace(/\s+/g, " ")
    .trim()
    .replace(LEADING_EMOJI, "")
    .trim();
  if (!clean) return "";

  // Array.from, not .length: an emoji is two UTF-16 units and every one of
  // these opens with one.
  const chars = Array.from(clean);
  if (chars.length <= max) return clean;

  const budget = chars.slice(0, max).join("");

  // A whole sentence is always better than a longer fragment.
  const lastStop = Math.max(
    budget.lastIndexOf("."),
    budget.lastIndexOf("!"),
    budget.lastIndexOf("?"),
  );
  // Not so short that it says nothing — half the budget is the floor.
  if (lastStop >= max * 0.5) return budget.slice(0, lastStop + 1).trim();

  const lastSpace = budget.lastIndexOf(" ");
  const cut = lastSpace > 0 ? budget.slice(0, lastSpace) : budget;
  return cut.replace(/[\s,;:—–-]+$/, "") + "…";
}
