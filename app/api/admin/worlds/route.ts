import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { canEdit, worldScope, visibleWorlds } from "@/lib/world-docs/access";
import { isWorldId, type WorldDoc, type WorldId } from "@/lib/world-docs/types";
import {
  cancelSchedule,
  discardDraft,
  getEditableWorld,
  getWorldRecord,
  listRevisions,
  publishWorld,
  rollbackWorld,
  saveDraft,
  scheduleWorld,
} from "@/lib/world-docs/store";
import { freshWorldDoc } from "@/lib/world-docs/defaults";
import { getContent } from "@/lib/content";

// ── PER-WORLD WRITES, NOT ONE BLOB ──────────────────────────────────────────
//
// The contrast with /api/admin/content is the point of this route existing.
// That one PUTs the entire site in a single write, so two people editing two
// unrelated things overwrite each other. Everything here is scoped to one
// world and one column, so publishing Curated cannot touch Stays, and saving a
// draft cannot touch the live page at all.

async function scope() {
  return worldScope(await cookies());
}

/** Which worlds are composed from a document rather than edited elsewhere. */
function hasEngine(world: WorldId): boolean {
  return world === "curated" || world === "authentic";
}

function forbidden(message = "You do not have access to that world.") {
  return NextResponse.json({ error: message }, { status: 403 });
}

/** A compact catalogue for the admin's card pickers — ids, names, photos. */
async function pickerCatalogue() {
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
      // Petrol stations are on the map because a rider needs fuel, not because
      // anyone would curate one. Hiding them here keeps the picker readable.
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

export async function GET(req: NextRequest) {
  const s = await scope();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const world = (req.nextUrl.searchParams.get("world") ?? "curated") as WorldId;
  if (!isWorldId(world)) return NextResponse.json({ error: "Unknown world" }, { status: 400 });
  if (!canEdit(s, world)) return forbidden();

  // The two EXPERIENCE worlds have a document engine. The remaining entries in
  // the switcher are sections of the site that are still edited elsewhere, and
  // they answer honestly rather than showing an empty editor that saves into a
  // void.
  if (!hasEngine(world)) {
    return NextResponse.json({
      scope: { kind: s.kind, name: s.name, worlds: visibleWorlds(s) },
      world,
      supported: false,
    });
  }

  const { doc, record } = await getEditableWorld(world);
  const revisions = await listRevisions(world);
  return NextResponse.json({
    scope: { kind: s.kind, name: s.name, worlds: visibleWorlds(s) },
    world,
    supported: true,
    doc,
    hasDraft: !!record.draft,
    publishedAt: record.publishedAt,
    updatedAt: record.updatedAt,
    scheduledAt: record.scheduledAt,
    storageError: record.storageError,
    isLive: !!record.published,
    revisions,
    catalogue: await pickerCatalogue(),
  });
}

/** Save the draft. Never touches what the public sees. */
export async function PUT(req: NextRequest) {
  const s = await scope();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { world?: string; doc?: WorldDoc };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const world = (body.world ?? "curated") as WorldId;
  if (!isWorldId(world)) return NextResponse.json({ error: "Unknown world" }, { status: 400 });
  if (!canEdit(s, world)) return forbidden();

  const doc = body.doc;
  // A document with no sections is legitimate; a document that is not a
  // document is a bug on its way to being saved over someone's work.
  if (!doc || typeof doc !== "object" || !doc.hero || !Array.isArray(doc.sections)) {
    return NextResponse.json({ error: "That does not look like a world document." }, { status: 422 });
  }

  try {
    await saveDraft(world, doc, s.name);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[worlds] draft save failed", err);
    return NextResponse.json({ error: "Could not save the draft." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = await scope();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { world?: string; action?: string; at?: string; revisionId?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const world = (body.world ?? "curated") as WorldId;
  if (!isWorldId(world)) return NextResponse.json({ error: "Unknown world" }, { status: 400 });
  if (!canEdit(s, world)) return forbidden();

  try {
    switch (body.action) {
      case "publish": {
        await publishWorld(world, s.name, body.label);
        // The published page is ISR-cached. Without this the owner presses
        // Publish, opens the site, sees the old page and concludes it failed.
        revalidatePath("/curated");
        break;
      }
      case "schedule": {
        const at = body.at ? new Date(body.at) : null;
        if (!at || Number.isNaN(at.getTime())) {
          return NextResponse.json({ error: "That date could not be read." }, { status: 422 });
        }
        if (at.getTime() <= Date.now()) {
          return NextResponse.json(
            { error: "Pick a time in the future — to release it now, press Publish." },
            { status: 422 },
          );
        }
        await scheduleWorld(world, at, s.name);
        break;
      }
      case "cancel-schedule":
        await cancelSchedule(world);
        break;
      case "discard":
        await discardDraft(world);
        break;
      case "rollback": {
        if (!body.revisionId) {
          return NextResponse.json({ error: "No version given." }, { status: 400 });
        }
        const doc = await rollbackWorld(world, body.revisionId, s.name);
        return NextResponse.json({ success: true, doc });
      }
      case "reset-to-defaults": {
        // Deliberately writes the seed into the DRAFT, so "start again" is
        // still one preview and one Publish away from being visible.
        await saveDraft(world, freshWorldDoc(world), s.name);
        return NextResponse.json({ success: true, doc: freshWorldDoc(world) });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const record = await getWorldRecord(world);
    return NextResponse.json({
      success: true,
      hasDraft: !!record.draft,
      publishedAt: record.publishedAt,
      scheduledAt: record.scheduledAt,
      isLive: !!record.published,
      revisions: await listRevisions(world),
    });
  } catch (err) {
    console.error("[worlds] action failed", body.action, err);
    const message = err instanceof Error ? err.message : "Something went wrong.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
