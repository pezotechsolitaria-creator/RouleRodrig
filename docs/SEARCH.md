# Site search — roulerodrig.com

One search for the whole site: the header's 🔍 button, **Cmd/Ctrl + K**, or **/**.
Built 4 Oct 2026 with [Fuse.js](https://github.com/krisk/fuse) 7.5.

## How it works

| Piece | File | What it does |
|---|---|---|
| Index builder | `lib/search/build.ts` | Turns site content into ~120 entries per language (title in all three languages, one-line description, keywords, link, price). Pure — tested against a fixture. |
| Static pages | `lib/search/pages.ts` | Services and guides no table lists (taxi, map, manage booking…). A test checks every link is a real route. |
| Vocabulary | `lib/search/aliases.ts` + table `search_synonyms` | Groups of words that find each other: plage ↔ beach ↔ laplaz, moto ↔ scooter, ourite ↔ octopus. |
| Index route | `app/api/search-index/[lang]/route.ts` | Static JSON per language (en/fr/cr), rebuilt hourly and whenever site content is saved. ~35 KB, ~10 KB gzipped. |
| Engine | `lib/search/engine.ts` | Fuse.js plus five measured rules (fuzzy titles, near-exact descriptions, intent words, whole-phrase synonyms, strict short queries). |
| Shell | `components/search/GlobalSearch.tsx` | The dialog + input, on every page (tiny). Opens instantly, phone keyboard included. |
| Results | `components/search/SearchPanel.tsx` | Loaded on first open (or when a finger rests on the button): Fuse, the index, grouped results, keyboard nav, recent searches, "Ask Ti Roulé". |

What is searchable: vehicles, stays, experiences and tours, the five experience
types, every map place (beaches, viewpoints, landmarks, fuel, craft shops),
hikes and rides, upcoming events, dishes, FAQ answers, emergency numbers, and
the site's own pages. Hidden content is never indexed (getContent() removes it
first). The eSIM store is left out while it is closed.

Every result links where that thing's own card links — `/browse/stays?place=…`
opens the stay, `/guide/beaches#id` scrolls to the beach, `/map?loc=id` opens the
map on a place with it ringed, `/faq#faq-q-id` opens that answer,
`/emergency#contact-id` lands on the number.

## Keeping it up to date

**Nothing to do for content.** Adding or editing a vehicle, stay, place, route,
FAQ or contact in /admin refreshes the index with the next page view (the admin
save revalidates the `site-content` cache the index is built from). Events and
dishes appear within the hour. Visitors' phones refresh their stored copy when it
is over 30 minutes old.

**When a search finds nothing that it should:** PostHog's `search_no_results`
event lists those queries (emails and phone numbers are never sent). Then either
- add the words to a group in `lib/search/aliases.ts` (any language, accents
  don't matter), or add a pair to the `search_synonyms` table — both find each
  other; or
- add a page to `lib/search/pages.ts` if it is a page people look for by name.

Then run `npx vitest run lib/search` — `engine.test.ts` checks real queries
("pointe coton", "snorkling", "stay", "atm" …) against a snapshot of the live index.

**Refresh the test snapshot** after big content changes:
`curl http://localhost:3044/api/search-index/en -o lib/search/__fixtures__/index-en.json`
(then blank its `syn` field — the test rebuilds synonyms from the current code).

## Analytics (PostHog)

`search_opened` (via button/shortcut), `search_query` (query, result count,
language — sent after typing stops), `search_no_results`, `search_result_clicked`
(kind, id, position), `search_ask_tiroule`. Queries that look like an email or a
phone number are replaced with `[withheld]` before sending.
