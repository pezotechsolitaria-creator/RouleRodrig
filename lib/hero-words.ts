// ── THE HEADLINE BROKE IN THE MIDDLE OF A WORD ──────────────────────────────
//
// The homepage greeting animates one LETTER at a time, so every character is
// its own inline-block <span> and the gap between the two words is an empty
// width-only span rather than a space character.
//
// That leaves the line with no whitespace text node anywhere — and a run of
// inline-blocks with no whitespace between them gives the browser a break
// opportunity between EVERY PAIR of them. Measured on the homepage at 1280px,
// a common laptop width, it took one:
//
//     WELCOMET
//     O
//
// at 84px, above the fold, as the first thing anybody sees. Nothing reported
// it because the element carries aria-label="WELCOME TO", so what a screen
// reader announces was right the whole time; only the eye could catch this.
//
// Grouping the letters by word and forbidding a break inside each group leaves
// exactly one legal break — the gap between the words, which is where a line
// is supposed to break.

export type HeroWord = {
  text: string;
  /**
   * The first letter's index in the ORIGINAL line, spaces included.
   *
   * The intro staggers each letter's delay on this index, so grouping the
   * letters must not renumber them: the animation has to arrive in the same
   * order it did before the words existed.
   */
  at: number;
};

export function splitWords(line: string): HeroWord[] {
  const out: HeroWord[] = [];
  let at = 0;
  for (const text of line.split(" ")) {
    out.push({ text, at });
    at += text.length + 1; // + the space that was split out
  }
  return out;
}
