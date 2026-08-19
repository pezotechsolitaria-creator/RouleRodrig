import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getContentWithStatus, saveContent } from "@/lib/content";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { missingFactsFor } from "@/lib/legal";

// ── THE COMPANY'S OWN IDENTITY (P1 #2) ──────────────────────────────────────
//
// Legal name, BRN, registered office and publication director, so the owner can
// publish them without a deploy. These are facts about a company registry that
// arrive on the registry's schedule; requiring a code change to publish them is
// how a site ends up trading for months with no legal notice at all.
//
// ── WHY THIS IS NOT PART OF THE BIG CONTENT PUT ─────────────────────────────
// /api/admin/content replaces the ENTIRE site blob with the admin's in-memory
// copy. That is fine for the studio, which loaded the whole thing a moment
// earlier, but it means any surface that writes one field by that route also
// re-publishes every other field as it looked when the page was opened. This
// route instead reads the current content and writes back only the legal block,
// so saving a BRN can never revert somebody's unrelated edit.

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

// Trimmed, length-capped, and every field optional — an empty string is a
// legitimate value here, meaning "still outstanding". It is NOT coerced to a
// placeholder: lib/legal.ts already renders a blank as visibly outstanding, and
// inventing a value for a legal identity is the one thing this must never do.
const legalSchema = z.object({
  legalName: z.string().trim().max(200).optional(),
  brn: z.string().trim().max(50).optional(),
  registeredAddress: z.string().trim().max(400).optional(),
  tradingAddress: z.string().trim().max(400).optional(),
  publicationDirector: z.string().trim().max(200).optional(),
  certificatePath: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { content, loaded } = await getContentWithStatus();
  if (!loaded) {
    return NextResponse.json(
      { error: "Could not read the current content. Please retry in a moment." },
      { status: 503 },
    );
  }
  const legal = content.legal ?? {};
  return NextResponse.json({ legal, missing: missingFactsFor(legal) });
}

export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = legalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  // Read-modify-write. Refusing on a failed read is the same rule the big
  // content PUT follows, and for the same reason: a Supabase blip must not let
  // one click replace the live site with seed defaults.
  const { content, loaded } = await getContentWithStatus();
  if (!loaded) {
    return NextResponse.json(
      { error: "Could not read the current content, so the save was refused to avoid overwriting it. Please retry in a moment." },
      { status: 503 },
    );
  }

  const legal = { ...(content.legal ?? {}), ...parsed.data };
  await saveContent({ ...content, legal });

  try {
    const { getPrivileged, hasServiceRole } = await import("@/lib/supabase/admin");
    const { audit } = await import("@/lib/admin/audit");
    if (hasServiceRole()) {
      // WHICH fields changed, never the values: a BRN and a registered address
      // are the identity documents of the business, and the audit log is not
      // where a second copy of them should accumulate.
      const changed = Object.keys(parsed.data).filter(
        (k) =>
          (content.legal ?? {})[k as keyof typeof legal] !==
          parsed.data[k as keyof typeof parsed.data],
      );
      await audit(await getPrivileged(), {
        action: "legal.save",
        entityType: "site_content",
        entityId: "main",
        diff: { changed },
      });
    }
  } catch (err) {
    console.error("legal save audit failed", err);
  }

  // The notice page, the privacy page and the footer all publish these facts
  // under ISR, so without this the owner saves a BRN and the public page keeps
  // showing "to be confirmed" for up to an hour.
  revalidatePath("/legal/notice");
  revalidatePath("/legal/privacy");
  revalidatePath("/");

  return NextResponse.json({ legal, missing: missingFactsFor(legal) });
}
