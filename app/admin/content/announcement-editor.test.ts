import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AnnouncementContent } from "@/lib/defaults";
import { DEFAULT_CONTENT } from "@/lib/defaults";
import { announcementMessages } from "@/components/AnnouncementBar";
import AnnouncementEditor, { editableMessages, messageWarning, withMessages } from "./AnnouncementEditor";

// ── THE ANNOUNCEMENT EDITOR, BACK (architecture review 2026-09-30, item 1) ──
//
// The live bar reads content.announcement (active, items[], bgColor) on every
// page; its editor was deleted in e9d72b0c and switching the bar off took SQL.
// These render the restored editor and check it writes the shape the bar reads
// — through the bar's own announcementMessages(), not a copy of its rules.

const off: AnnouncementContent = {
  ...DEFAULT_CONTENT.announcement,
  active: false,
  items: [],
  text: "",
  link: "",
  linkText: "",
};
const render = (a: AnnouncementContent) =>
  renderToStaticMarkup(createElement(AnnouncementEditor, { announcement: a, onChange: () => {} }));

describe("what the editor writes is what the bar shows", () => {
  it("keeps the legacy single-message fields on message one", () => {
    const next = withMessages(off, [
      { text: "Ferry delayed", link: "/taxi", linkText: "Taxi" },
      { text: "Second", link: "", linkText: "" },
    ]);
    expect(next).toMatchObject({ text: "Ferry delayed", link: "/taxi", linkText: "Taxi" });
    expect(announcementMessages({ ...next, active: true }).map((m) => m.text)).toEqual(["Ferry delayed", "Second"]);
  });

  it("offers a row to type into on a blob that has never had a message", () => {
    expect(editableMessages(off)).toEqual([{ text: "", link: "", linkText: "" }]);
  });

  it("reads an older blob's single message as message one", () => {
    const legacy = { ...off, items: undefined, text: "Old style", link: "", linkText: "" };
    expect(editableMessages(legacy)[0].text).toBe("Old style");
  });
});

describe("the warnings match the bar's own rules", () => {
  it("a link without link text is not drawn by the bar, and the editor says so", () => {
    expect(messageWarning({ text: "Hi", link: "/taxi", linkText: "" })).toMatch(/without it the link is not shown/);
  });
  it("link text without a link, likewise", () => {
    expect(messageWarning({ text: "Hi", link: "", linkText: "Go" })).toMatch(/without it the link is not shown/);
  });
  it("an address that is neither a page, an anchor nor https", () => {
    expect(messageWarning({ text: "Hi", link: "taxi", linkText: "Go" })).toMatch(/start with \//);
  });
  it("nothing to say about a complete message", () => {
    expect(messageWarning({ text: "Hi", link: "https://wa.me/1", linkText: "Chat" })).toBeNull();
  });
});

describe("the rendered editor", () => {
  it("shows the switch off, and says nothing is on the site", () => {
    const html = render(off);
    expect(html).toMatch(/role="switch" aria-checked="false"/);
    expect(html).toContain("Off — nothing shows on the site.");
  });

  it("warns when the bar is on with no message — the bar renders nothing then", () => {
    expect(render({ ...off, active: true })).toContain("On, but there is no message yet");
  });

  it("previews the message through the live bar component", () => {
    const html = render({
      ...off,
      active: true,
      bgColor: "green",
      items: [{ text: "Closed Sunday", link: "/contact", linkText: "Ask us" }],
    });
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    // The bar's own markup: its colour class and the message.
    expect(html).toContain("bg-emerald-500");
    expect(html).toContain("Closed Sunday");
    expect(html).toMatch(/role="radio" aria-checked="true" aria-label="Green"/);
  });
});

describe("the preview shows the phone cut, not just the wide one (item 1, follow-up)", () => {
  // The live bar is one line that truncates with "…" and has no breakpoints:
  // only its container's width decides how much shows. The first preview was
  // the admin column's width and labelled "as it looks on the site", so a
  // message a phone cuts mid-word looked whole. These pin a second copy of the
  // REAL bar inside a phone-width frame, so the owner sees the cut himself.
  const msg = "Ferry delayed today — call us to move your pickup";
  const active = (link = "", linkText = ""): AnnouncementContent => ({
    ...off,
    active: true,
    items: [{ text: msg, link, linkText }],
  });

  /** The markup inside the element carrying data-preview="<which>". */
  const frame = (html: string, which: "phone" | "wide") => {
    const at = html.indexOf(`data-preview="${which}"`);
    expect(at, `no ${which} preview frame`).toBeGreaterThan(-1);
    const open = html.lastIndexOf("<div", at);
    const tag = html.slice(open, html.indexOf(">", at) + 1);
    // Walk to the matching </div> so the slice is this frame and nothing else.
    let depth = 0;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = open;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[0] === "</div>" ? -1 : 1;
      if (depth === 0) return { tag, inner: html.slice(open, m.index) };
    }
    throw new Error("unclosed frame");
  };

  it("renders the live bar twice: in a 375px phone frame and full width", () => {
    const html = render(active());
    const phone = frame(html, "phone");
    const wide = frame(html, "wide");
    expect(phone.tag).toContain("w-[375px]");
    // The bar itself — its fixed height, its truncating message — not a mock-up.
    for (const f of [phone, wide]) {
      expect(f.inner).toContain("h-11");
      expect(f.inner).toMatch(/<span class="truncate">Ferry delayed today — call us to move your pickup<\/span>/);
    }
    expect(html).toContain("ON A PHONE");
    expect(html).toContain("ON A TABLET OR COMPUTER");
    expect(html).not.toContain("AS IT LOOKS ON THE SITE");
  });

  it("the phone frame carries the link too, which takes room from the text there", () => {
    const { inner } = frame(render(active("/taxi", "Book a taxi")), "phone");
    expect(inner).toContain('href="/taxi"');
    expect(inner).toContain("Book a taxi");
  });

  it("tells the owner phones cut the message, so the important words go first", () => {
    expect(render(active())).toContain("Phones show one line and cut the rest off");
  });

  it("draws no frames, only the prompt, while there is no message", () => {
    const html = render({ ...off, active: true });
    expect(html).not.toContain('data-preview="phone"');
    expect(html).toContain("Write a message below to see it here.");
  });

  it("its own example message is one a phone can show whole", () => {
    // The old placeholder was itself a message a phone cut mid-word. ~35
    // characters fit on a 375px phone with no link; keep the example under it.
    const example = render(off).match(/placeholder="e\.g\. ([^"]+)"/)?.[1] ?? "";
    expect(example.length).toBeGreaterThan(0);
    expect(example.length).toBeLessThanOrEqual(30);
  });
});
