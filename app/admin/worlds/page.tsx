import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { worldScope, visibleWorlds, canEdit } from "@/lib/world-docs/access";
import { WORLD_META, isWorldId, type WorldId } from "@/lib/world-docs/types";
import { getEditableCurated, listRevisions } from "@/lib/world-docs/store";
import { getContent } from "@/lib/content";
import EditorSignIn from "./EditorSignIn";
import WorldsStudio from "./WorldsStudio";
import type { PickerCatalogue } from "./CardEditor";

export const metadata = { title: "Worlds studio — Roule Rodrigues" };

// Reads cookies, so it is dynamic by nature. That is correct for an editor:
// this screen must never be served from a cache built for somebody else.
export const dynamic = "force-dynamic";

async function pickerCatalogue(): Promise<PickerCatalogue> {
  const content = await getContent();
  return {
    places: content.recommended.items.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      serviceType: p.serviceType ?? null,
      isTour: !!p.isTour,
      image: p.image || p.images?.[0] || "",
    })),
    locations: content.mapLocations
      .filter((l) => l.category !== "gas")
      .map((l) => ({
        id: l.id,
        name: l.name,
        category: l.category,
        image: l.image || l.images?.[0] || "",
        hasStory: !!(l.story ?? "").trim(),
      })),
    routes: content.rideRoutes.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind ?? "ride",
      image: r.image || r.images?.[0] || "",
    })),
  };
}

export default async function AdminWorldsPage({
  searchParams,
}: {
  searchParams: Promise<{ world?: string }>;
}) {
  const scope = worldScope(await cookies());
  if (!scope) return <EditorSignIn />;

  const params = await searchParams;
  const allowed = visibleWorlds(scope);
  const requested = params.world && isWorldId(params.world) ? (params.world as WorldId) : null;
  // Land on the world this person can actually edit. An editor who only has
  // Stays should not open the studio on Curated and be told "no".
  const world: WorldId =
    requested && canEdit(scope, requested) ? requested : (allowed[0] ?? "curated");

  // Only Curated has a document engine today. Rather than showing an editor
  // that saves nowhere, the other worlds say plainly where they ARE edited —
  // an empty form that silently does nothing is the worse failure.
  if (world !== "curated") {
    return (
      <div className="min-h-screen bg-dark px-5 py-8">
        <div className="mx-auto max-w-2xl">
          <Link
            href="/admin/worlds?world=curated"
            className="inline-flex items-center gap-2 font-dm text-[13px] text-muted hover:text-yellow"
          >
            <ArrowLeft size={14} /> Back to the Curated world
          </Link>
          <h1 className="mt-4 font-syne text-xl font-extrabold text-offwhite">
            {WORLD_META[world].label}
          </h1>
          <p className="mt-2 font-dm text-sm text-muted">{WORLD_META[world].blurb}</p>
          <div className="mt-5 rounded-2xl border border-white/10 bg-dark-card p-4">
            <p className="font-dm text-[13px] text-offwhite">
              This world does not have its own editable page yet. Its content is
              still managed where it always has been:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/admin/content"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[12px] text-offwhite hover:border-yellow/50 hover:text-yellow"
              >
                Content studio
              </Link>
              <Link
                href={WORLD_META[world].href}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3 py-1.5 font-dm text-[12px] text-muted hover:border-yellow/40 hover:text-offwhite"
              >
                <ExternalLink size={12} /> See the page
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { doc, record } = await getEditableCurated(world);
  const [revisions, catalogue] = await Promise.all([listRevisions(world), pickerCatalogue()]);

  return (
    <WorldsStudio
      scope={{ kind: scope.kind, name: scope.name, worlds: allowed }}
      world={world}
      doc={doc}
      catalogue={catalogue}
      hasDraft={!!record.draft}
      isLive={!!record.published}
      publishedAt={record.publishedAt}
      scheduledAt={record.scheduledAt}
      storageError={record.storageError}
      revisions={revisions}
    />
  );
}
