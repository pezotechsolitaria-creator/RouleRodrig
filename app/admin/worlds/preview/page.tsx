import { cookies } from "next/headers";
import { worldScope, canEdit } from "@/lib/world-docs/access";
import { isWorldId, type WorldId } from "@/lib/world-docs/types";
import { getEditableWorld } from "@/lib/world-docs/store";
import { buildWorldView } from "@/lib/world-docs/page-data";
import WorldPage from "@/components/world-page/WorldPage";
import WorldFonts from "@/components/world-page/WorldFonts";

export const dynamic = "force-dynamic";
// A draft page must never be indexed, and must never be cached anywhere.
export const metadata = { robots: { index: false, follow: false } };

/**
 * The live preview.
 *
 * ── THE SAME COMPONENTS, NOT A MOCK-UP ────────────────────────────────────
 * This renders the DRAFT through `buildWorldView` and `WorldPage` — the
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

  const { doc } = await getEditableWorld(world);
  // The preview ranks by the world being edited, so the auto top-up an
  // editor sees is the one a visitor will get.
  const view = await buildWorldView(
    doc,
    world === "authentic" || world === "curated" ? world : undefined,
  );

  return (
    <WorldFonts>
      <WorldPage world={world} doc={doc} view={view} />
    </WorldFonts>
  );
}
