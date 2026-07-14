// Ti Roulé mascot poses. The owner uploads each expression in
// Admin → Branding → "Ti Roulé poses"; the animated assistant swaps between
// them as it talks. `image` (branding.mascotImage) stays the single default so
// everything still works if only one pose is uploaded.

export const MASCOT_POSES: { key: string; label: string }[] = [
  { key: "welcome", label: "Welcome (arms open)" },
  { key: "happy", label: "Happy" },
  { key: "thinking", label: "Thinking" },
  { key: "excited", label: "Excited" },
  { key: "winking", label: "Winking" },
  { key: "surprised", label: "Surprised" },
  { key: "holdingMap", label: "Holding map" },
  { key: "pointing", label: "Pointing" },
  { key: "onScooter", label: "On scooter" },
  { key: "lookingAround", label: "Looking around" },
  { key: "withCamera", label: "With camera" },
  { key: "atBeach", label: "At the beach" },
  { key: "atViewpoint", label: "At a viewpoint" },
  { key: "hiking", label: "Hiking" },
  { key: "bySunset", label: "By sunset" },
];

// Resolve a pose to a usable image, falling back gracefully so the assistant is
// never blank: requested pose → happy → welcome → the single default image.
export function resolvePose(
  key: string | undefined,
  poses: Record<string, string> | undefined,
  fallback: string | undefined,
): string | undefined {
  const p = poses ?? {};
  return (
    (key ? p[key] : undefined) ||
    p.happy ||
    p.welcome ||
    fallback ||
    Object.values(p)[0]
  );
}
