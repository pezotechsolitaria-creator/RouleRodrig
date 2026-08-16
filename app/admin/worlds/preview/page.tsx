import { cookies } from "next/headers";
import { worldScope, canEdit } from "@/lib/world-docs/access";
import { isWorldId, type WorldId } from "@/lib/world-docs/types";
import { getEditableCurated } from "@/lib/world-docs/store";
import { buildCuratedView } from "@/lib/world-docs/page-data";
import CuratedWorld from "@/components/curated/CuratedWorld";
import CuratedFonts from "@/components/curated/CuratedFonts";

export const dynamic = "force-dynamic";
// A draft page must never be indexed, and must never be cached anywhere.
export const metadata = { robots: { index: false, follow: false } };

/**
 * The live preview.
 *
 * ── THE SAME COMPONENTS, NOT A MOCK-UP ────────────────────────────────────
 * This renders the DRAFT through `buildCuratedView` and `CuratedWorld` — the
 * exact two things the public page uses. The alternative, drawing an
 * approximation of the page inside the admin, is a second implementation of the
 * layout that drifts from the real one, and a preview that is approximately
 * right is worse than none: it teaches the editor to trust something that is
 * lying to them.
 *
 * The only differences from /curated are the document (draft, not published)
 * and the gate (an editor session, checked here rather than assumed because
 * this URL is openable directly).
 */
export default async function WorldPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ world?: string }>;
}) {
  const scope = worldScope(await cookies());
  const params = await searchParams;
  const world: WorldId =
    params.world && isWorldId(params.world) ? (params.world as WorldId) : "curated";

  if (!scope || !canEdit(scope, world)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-dark px-6 text-center">
        <p className="font-dm text-sm text-muted">
          Sign in to the worlds studio to see this preview.
        </p>
      </div>
    );
  }

  const { doc } = await getEditableCurated(world);
  const view = await buildCuratedView(doc);

  return (
    <CuratedFonts>
      <CuratedWorld
        doc={doc}
        sections={view.sections}
        moods={view.moods}
        heroImages={view.heroImages}
        logo={view.logo}
        mascot={view.mascot}
      />
    </CuratedFonts>
  );
}
