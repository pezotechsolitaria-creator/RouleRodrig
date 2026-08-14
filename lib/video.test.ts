import { describe, it, expect } from "vitest";
import { parseVideoUrl, isEmbed, describeVideoUrl, youtubeBackgroundUrl } from "./video";

// The bug: the owner pasted a YouTube link into the hero video field and the
// video silently never appeared. Every case below is a link a real person might
// actually paste, because the failure mode was invisible — there was no error,
// no warning, just the still photo.

describe("parseVideoUrl — YouTube", () => {
  it("reads a standard watch link", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({
      kind: "youtube", id: "dQw4w9WgXcQ",
    });
  });

  it("reads the share link the mobile app gives you", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({
      kind: "youtube", id: "dQw4w9WgXcQ",
    });
  });

  it("reads a link copied at a timestamp", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ?t=42")).toMatchObject({ kind: "youtube" });
  });

  it("reads a watch link that also carries a playlist", () => {
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLabc123"),
    ).toMatchObject({ kind: "youtube", id: "dQw4w9WgXcQ" });
  });

  it("reads a Short", () => {
    expect(parseVideoUrl("https://www.youtube.com/shorts/abc123XYZ_-")).toMatchObject({
      kind: "youtube", id: "abc123XYZ_-",
    });
  });

  it("reads an embed link somebody copied from an iframe", () => {
    expect(parseVideoUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toMatchObject({
      kind: "youtube",
    });
  });

  it("reads a link without the www", () => {
    expect(parseVideoUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toMatchObject({
      kind: "youtube",
    });
  });
});

describe("youtubeBackgroundUrl", () => {
  const url = youtubeBackgroundUrl("dQw4w9WgXcQ");

  it("uses the no-cookie host", () => {
    expect(url.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe(true);
  });

  it("repeats the id as a playlist, or loop is ignored", () => {
    // YouTube silently ignores loop=1 on a single video without this, so the
    // hero would play once and then show a grid of unrelated recommendations.
    expect(url).toContain("loop=1");
    expect(url).toContain("playlist=dQw4w9WgXcQ");
  });

  it("is muted, which is what makes autoplay legal at all", () => {
    expect(url).toContain("mute=1");
    expect(url).toContain("autoplay=1");
  });

  it("hides the chrome so a hero stays a hero", () => {
    expect(url).toContain("controls=0");
    expect(url).toContain("rel=0");
    expect(url).toContain("modestbranding=1");
  });

  it("sends the origin, or YouTube may never answer the handshake", () => {
    // The iPhone bug. HeroVideo reads the player's state over postMessage and
    // only uncovers the iframe once it reports PLAYING. YouTube checks `origin`
    // before it will talk, and without it the handshake fails hardest on iOS —
    // where "never answered" made the hero uncover the player blind and paint
    // YouTube's thumbnail and play button across the homepage.
    const withOrigin = youtubeBackgroundUrl("dQw4w9WgXcQ", "https://roulerodrig.com");
    expect(withOrigin).toContain("origin=https%3A%2F%2Froulerodrig.com");
  });

  it("omits origin rather than inventing one during SSR", () => {
    // This module is pure and also runs on the server, where there is no
    // window. A guessed origin would be worse than none: YouTube would reject
    // the handshake outright instead of merely being unreliable.
    expect(url).not.toContain("origin=");
  });

  it("plays inline rather than going fullscreen on iOS", () => {
    expect(url).toContain("playsinline=1");
  });
});

describe("parseVideoUrl — Vimeo", () => {
  it("reads a standard link", () => {
    expect(parseVideoUrl("https://vimeo.com/123456789")).toMatchObject({
      kind: "vimeo", id: "123456789",
    });
  });

  it("reads a /video/ link", () => {
    expect(parseVideoUrl("https://vimeo.com/video/123456789")).toMatchObject({ kind: "vimeo" });
  });
});

describe("parseVideoUrl — direct files", () => {
  it("accepts the formats a browser can actually decode", () => {
    for (const ext of ["mp4", "webm", "ogg", "mov", "m4v"]) {
      expect(parseVideoUrl(`https://cdn.example.com/clip.${ext}`).kind).toBe("file");
    }
  });

  it("accepts a Supabase Storage URL, which carries a query string", () => {
    expect(
      parseVideoUrl("https://x.supabase.co/storage/v1/object/public/hero-video/a.mp4?token=abc").kind,
    ).toBe("file");
  });

  it("passes the original URL straight through as the embed url", () => {
    const u = "https://cdn.example.com/clip.mp4";
    expect(parseVideoUrl(u).embedUrl).toBe(u);
  });
});

describe("parseVideoUrl — the ones that must NOT be guessed at", () => {
  it("refuses a Google Drive share page", () => {
    // Rendering this in a <video> is exactly what produced the silent failure.
    expect(parseVideoUrl("https://drive.google.com/file/d/1a2b3c/view").kind).toBe("unknown");
  });

  it("refuses a Facebook post and a bare domain", () => {
    expect(parseVideoUrl("https://facebook.com/somepost").kind).toBe("unknown");
    expect(parseVideoUrl("https://example.com").kind).toBe("unknown");
  });

  it("returns no embed url for anything unknown, so nothing is rendered", () => {
    expect(parseVideoUrl("https://example.com").embedUrl).toBeNull();
  });

  it("handles empty, null and whitespace without throwing", () => {
    for (const v of ["", "   ", null, undefined]) {
      expect(parseVideoUrl(v as string).kind).toBe("unknown");
    }
  });
});

describe("isEmbed", () => {
  it("separates what needs an iframe from what needs a video element", () => {
    expect(isEmbed("youtube")).toBe(true);
    expect(isEmbed("vimeo")).toBe(true);
    expect(isEmbed("file")).toBe(false);
    expect(isEmbed("unknown")).toBe(false);
  });
});

describe("describeVideoUrl — the half that stops this happening again", () => {
  // Pasting a link is a supported route, by the owner's decision: it needs no
  // file, no upload and no compression step, which is often the difference
  // between a hero video existing and not.
  it("confirms a YouTube link will work", () => {
    const d = describeVideoUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(d.ok).toBe(true);
    expect(d.label).toBe("YouTube");
  });

  it("confirms a Vimeo link will work", () => {
    const d = describeVideoUrl("https://vimeo.com/123456789");
    expect(d.ok).toBe(true);
  });

  it("says plainly when a link will NOT play, and why", () => {
    // The original bug was invisible. This is what makes it visible.
    const d = describeVideoUrl("https://drive.google.com/file/d/1a2b3c/view");
    expect(d.ok).toBe(false);
    expect(d.detail).toMatch(/not a video file/i);
  });

  it("does not scold an empty field", () => {
    const d = describeVideoUrl("");
    expect(d.ok).toBe(false);
    expect(d.label).toBe("No link yet");
  });
});
