import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

const MAP = read("components/IslandMap.tsx");
const SECTION = read("components/MapSection.tsx");
const PAGE = read("app/map/page.tsx");
const CSS = read("app/globals.css");
const ROUTE = read("app/api/places/event/route.ts");
const SQL = read("supabase/migrations/20260907080000_m184_place_signals.sql");

// ── The Popular layer on the island guide ───────────────────────────────────
//
// The brief asked for a score over views, bookings, ratings and recency. The
// live database had 0 place_bookings, 1 review and NO page-view table, so the
// first thing built was the counter. These guard the wiring around it, and the
// decisions that would be silently wrong rather than loudly broken.

describe("the layer works before any data exists", () => {
  it("scores from the owner's own flag when no counters are passed", () => {
    // This is the state on day one. A map that needed the server to have
    // counted something would have shipped showing nothing at all.
    expect(MAP).toMatch(/popularity\?\.\[loc\.id\] \?\?/);
    expect(MAP).toMatch(/curated: loc\.popular === true/);
    expect(SECTION).toMatch(/curated: l\.popular === true/);
  });

  it("hides the filter entirely when nothing qualifies", () => {
    // A filter that returns an empty map teaches people the map is broken.
    expect(SECTION).toMatch(/popularIds\.size > 0 && \(/);
  });

  it("asks the question once and gives the answer to both the chips and the map", () => {
    // This file already carries a long note about the filter bug where the list
    // and the map disagreed — because the same question was computed twice.
    expect(SECTION).toMatch(/const popularIds = new Set\(/);
    expect(SECTION).toMatch(/popularIds\.has\(l\.id\)/);
    expect(SECTION).toMatch(/<IslandMap locations=\{shown\} popularity=\{popularity\} \/>/);
  });
});

describe("only the popular pins pay for an HTML node", () => {
  it("keeps a cheap SVG circle for everything else", () => {
    // 42 divIcons would cost more on a mid-range Android than the feature is
    // worth, and the point of a hierarchy is that most things are not at the
    // top of it.
    expect(MAP).toMatch(/hot\s*\?\s*L\.marker/);
    expect(MAP).toMatch(/:\s*L\.circleMarker/);
  });

  it("keeps the category colour on a popular pin", () => {
    // The halo says "popular", the colour says "what". A popular beach must
    // still read as a beach.
    expect(MAP).toMatch(/rr-pop-dot" style="background:\$\{color\}/);
  });

  it("animates only transform and opacity", () => {
    // A keyframe on width/height lays out the whole marker pane every frame,
    // which is exactly what makes a map feel broken on a slow phone.
    //
    // Matched with a regex rather than sliced on "}\\n}": git converts this
    // repo to CRLF on checkout, so that literal stopped matching the moment
    // the file was committed, and the assertion then compared the string "@k"
    // against everything and passed nothing.
    const body = (CSS.match(/@keyframes rr-pop-pulse[\s\S]*?\}[\s]*\}/) || [""])[0];
    expect(body).toMatch(/transform:/);
    expect(body).not.toMatch(/width:|height:|top:|left:/);
  });

  it("stops the pulse for anyone who asked it to", () => {
    // The ring stays — it carries the meaning — and only the movement goes.
    expect(CSS).toMatch(/prefers-reduced-motion: reduce/);
    const block = CSS.slice(CSS.indexOf("prefers-reduced-motion"));
    expect(block).toMatch(/animation: none/);
  });
});

describe("the badge is never printed on a guess", () => {
  it("comes from the tier, which comes from confident evidence", () => {
    expect(MAP).toMatch(/const hot = isPopular\(pop\);/);
    expect(MAP).toMatch(/const tierWord = hot && pop\.tier !== "none"/);
    expect(MAP).toMatch(/const badge = tierWord/);
  });
});

describe("counting is fire-and-forget, and cannot break a page", () => {
  const TRACK = read("lib/places/track.ts");

  it("counts a view when the popup OPENS, not when the pin is drawn", () => {
    // Forty pins render on load and nobody has looked at any of them.
    expect(MAP).toMatch(/marker\.on\("popupopen"/);
    expect(MAP).toMatch(/trackPlace\(loc\.id, "view"\)/);
  });

  it("uses sendBeacon, because 'get directions' navigates away", () => {
    // A fetch started in that click is cancelled on unload — and that is the
    // signal worth the most.
    expect(TRACK).toMatch(/navigator\.sendBeacon/);
    expect(TRACK).toMatch(/keepalive: true/);
  });

  it("deduplicates a view per tab but never an intent", () => {
    // Pressing "directions" twice IS two decisions.
    expect(TRACK).toMatch(/if \(kind === "view"\)/);
    expect(TRACK).toMatch(/seen\.add\(key\)/);
  });

  it("binds listeners without an inline handler", () => {
    // The popup is a STRING handed to Leaflet. A CSP loose enough for inline
    // handlers is loose enough for a lot else.
    expect(MAP).toMatch(/data-rr-track=/);
    expect(MAP).not.toMatch(/onclick=/);
  });

  it("answers 204 whatever happens", () => {
    expect(ROUTE).toMatch(/new NextResponse\(null, \{ status: 204 \}\)/);
    expect(ROUTE).not.toMatch(/status: 500/);
  });

  it("rate-limits the door", () => {
    expect(ROUTE).toMatch(/guard\(req, "place-event", \d+, 60_000\)/);
  });
});

describe("the counter table is built to stay small", () => {
  it("stores one row per place per kind per day, not one per view", () => {
    // Storage and egress are the constraint on this project.
    expect(SQL).toMatch(/primary key \(place_id, kind, day\)/);
    expect(SQL).toMatch(/on conflict \(place_id, kind, day\) do update set n = place_events\.n \+ 1/);
  });

  it("is RPC-only in both directions", () => {
    expect(SQL).toMatch(/revoke all on table place_events from anon, authenticated/);
    expect(SQL).toMatch(/grant execute on function public\.bump_place_event/);
  });

  it("has no foreign key to the CMS, on purpose", () => {
    // Places are content: renamed, re-ordered and deleted freely. A counter
    // that blocked a delete would be a worse feature than an orphan row.
    const table = SQL.slice(SQL.indexOf("create table if not exists place_events"));
    expect(table.slice(0, 600)).not.toMatch(/references/);
  });

  it("is pruned rather than left to grow forever, BY SOMETHING THAT RUNS", () => {
    // A housekeeping function nothing calls is not housekeeping.
    expect(SQL).toMatch(/prune_place_events/);
    expect(read("app/api/cron/reminders/route.ts")).toMatch(/rpc\("prune_place_events"\)/);
  });
});

describe("the owner can actually mark a place", () => {
  it("has a checkbox in the admin map editor", () => {
    // Without this the whole layer stays invisible until enough tourists have
    // tapped enough pins — which is not a feature, it is a promise.
    const admin = read("app/admin/AdminDashboard.tsx");
    expect(admin).toMatch(/checked=\{loc\.popular === true\}/);
    expect(admin).toMatch(/popular: e\.target\.checked \|\| undefined/);
  });
});

describe("the page scores on the server", () => {
  it("so the first paint already knows which pins are which", () => {
    // Drawing forty identical dots and re-drawing six a second later is a map
    // that flickers on exactly the connection this island has.
    expect(PAGE).toMatch(/rankIslandPlaces\(content\.mapLocations, 7\)/);
    expect(PAGE).toMatch(/popularity=\{popularity\}/);
  });

  it("reads without cookies, so /map stays static", () => {
    // The server client reads cookies, and touching cookies opts the whole
    // route into dynamic rendering — a server render and a Supabase round trip
    // per visitor, on a project where egress is the constraint.
    //
    // The failure is SILENT: Next throws, the catch swallows it, and the page
    // ships with no popularity. lib/supabase/anon.ts exists because that exact
    // bug once shipped a sitemap missing every dish URL. The build named it
    // here too — "/map couldn't be rendered statically because it used
    // cookies" — which is the only reason this is not still doing it.
    const server = read("lib/places/popular-server.ts");
    expect(server).toMatch(/createAnonClient/);
    expect(server).not.toMatch(/from "@\/lib\/supabase\/server"/);
  });

  it("survives the counters being unreadable", () => {
    // A popularity layer is never worth taking the island guide down for.
    const server = read("lib/places/popular-server.ts");
    expect(server).toMatch(/catch \(err\)/);
    expect(server).toMatch(/place_popularity failed/);
  });
});
