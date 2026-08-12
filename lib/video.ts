// ── WHAT KIND OF VIDEO URL IS THIS? ────────────────────────────────────────
//
// The bug this exists to fix, reported by the owner: "video not working, I put
// a YouTube video on it".
//
// He had pasted a YouTube link into the hero video field. Every video surface
// on this site renders a raw <video src={url}>, and a YouTube WATCH PAGE is not
// a video file — the browser fetches HTML, the decode fails, and HeroVideo's
// onError handler unmounts the layer. So the site silently fell back to the
// still photo and nothing anywhere said why. Failing invisibly is the worst
// possible behaviour: the owner has no way to tell a broken link from a
// deliberate design.
//
// A YouTube link is a completely reasonable thing to paste, so the fix is to
// SUPPORT it rather than to reject it — and to say plainly in admin what each
// kind of link will do.
//
// This module is pure so the parsing can be tested directly. Nothing here
// touches the DOM.

export type VideoKind = "file" | "youtube" | "vimeo" | "unknown";

export type ParsedVideo = {
  kind: VideoKind;
  /** The provider's id, for youtube/vimeo. */
  id: string | null;
  /**
   * What to actually render:
   *  · file    → the original URL, in a <video src>
   *  · youtube → a privacy-friendly embed URL, in an <iframe>
   *  · vimeo   → an embed URL, in an <iframe>
   *  · unknown → null; render nothing rather than a broken box
   */
  embedUrl: string | null;
};

/** Extensions a browser can actually put in a <video> element. */
const FILE_EXT = /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i;

// Every YouTube shape a person might paste, including the ones people actually
// paste: a share link, a watch link with a playlist, a Short, an embed, and a
// link copied at a timestamp.
const YT_PATTERNS = [
  /(?:youtube\.com|youtube-nocookie\.com)\/watch\?(?:.*&)?v=([A-Za-z0-9_-]{6,})/i,
  /youtu\.be\/([A-Za-z0-9_-]{6,})/i,
  /(?:youtube\.com|youtube-nocookie\.com)\/embed\/([A-Za-z0-9_-]{6,})/i,
  /(?:youtube\.com|youtube-nocookie\.com)\/shorts\/([A-Za-z0-9_-]{6,})/i,
  /(?:youtube\.com|youtube-nocookie\.com)\/live\/([A-Za-z0-9_-]{6,})/i,
];

const VIMEO_PATTERN = /vimeo\.com\/(?:video\/)?(\d{6,})/i;

/**
 * Options for a BACKGROUND embed — muted, looping, chromeless.
 *
 * `playlist` is not a mistake: YouTube ignores `loop=1` on a single video
 * unless the same id is also given as a one-item playlist. Without it the hero
 * plays once and then shows YouTube's end screen of unrelated recommendations,
 * on the homepage, which is worse than no video at all.
 */
export function youtubeBackgroundUrl(id: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    loop: "1",
    playlist: id,
    playsinline: "1",
    modestbranding: "1",
    rel: "0",
    // Suppresses the related-video overlay and the title bar, so the hero
    // stays a hero rather than becoming an advert for someone else's channel.
    iv_load_policy: "3",
    disablekb: "1",
  });
  // -nocookie is the privacy-preserving host. It costs nothing and avoids
  // setting tracking cookies for visitors who never asked to be on YouTube.
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}

export function vimeoBackgroundUrl(id: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    muted: "1",
    loop: "1",
    background: "1",
    autopause: "0",
  });
  return `https://player.vimeo.com/video/${id}?${params.toString()}`;
}

/** Classify a URL the owner pasted, and say what to render for it. */
export function parseVideoUrl(raw: string | null | undefined): ParsedVideo {
  const url = (raw ?? "").trim();
  if (!url) return { kind: "unknown", id: null, embedUrl: null };

  for (const re of YT_PATTERNS) {
    const m = url.match(re);
    if (m?.[1]) return { kind: "youtube", id: m[1], embedUrl: youtubeBackgroundUrl(m[1]) };
  }

  const vm = url.match(VIMEO_PATTERN);
  if (vm?.[1]) return { kind: "vimeo", id: vm[1], embedUrl: vimeoBackgroundUrl(vm[1]) };

  // A direct file. Supabase Storage URLs carry a query string, which is why the
  // extension test tolerates one.
  if (FILE_EXT.test(url)) return { kind: "file", id: null, embedUrl: url };

  // A relative path to a file we serve ourselves.
  if (url.startsWith("/") && FILE_EXT.test(url)) {
    return { kind: "file", id: null, embedUrl: url };
  }

  // Anything else — a Google Drive share page, a Facebook post, a bare domain.
  // Deliberately NOT guessed at: rendering it in a <video> is what produced the
  // original silent failure.
  return { kind: "unknown", id: null, embedUrl: null };
}

/** True when this URL will play as an <iframe> rather than a <video>. */
export function isEmbed(kind: VideoKind): boolean {
  return kind === "youtube" || kind === "vimeo";
}

/**
 * A sentence for the ADMIN, so the owner is never left guessing again.
 *
 * This is the other half of the fix. Supporting YouTube silently would still
 * leave a Google Drive link failing with no explanation.
 */
export function describeVideoUrl(raw: string | null | undefined): {
  ok: boolean;
  label: string;
  detail: string;
} {
  const { kind } = parseVideoUrl(raw);
  if (!((raw ?? "").trim())) {
    return { ok: false, label: "No link yet", detail: "Paste a video link or upload a file." };
  }
  switch (kind) {
    case "youtube":
      return {
        ok: true,
        label: "YouTube",
        detail: "Plays muted and looping, with YouTube's controls hidden.",
      };
    case "vimeo":
      return { ok: true, label: "Vimeo", detail: "Plays muted and looping in the background." };
    case "file":
      return { ok: true, label: "Video file", detail: "Plays directly. MP4 works everywhere." };
    default:
      return {
        ok: false,
        label: "Not a video link",
        detail:
          "This will not play. Use a YouTube or Vimeo link, or a direct .mp4 / .webm file — a Google Drive or Facebook page is not a video file.",
      };
  }
}
