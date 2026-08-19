import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getContentWithStatus, saveContent } from "@/lib/content";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { missingFactsFor, missingClauses, resolveRefunds } from "@/lib/legal";

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

// The owner's own commercial rules, published in the Terms of Service. Blank
// is a legitimate value and renders publicly as "to be confirmed" — the page
// must never fill one in with a plausible guess, because a guessed term is one
// the business would be held to.
const termsSchema = z.object({
  vehicleMinAge: z.string().trim().max(200).optional(),
  deliveryFailedRule: z.string().trim().max(600).optional(),
  complaintWindow: z.string().trim().max(200).optional(),
  ageRestrictedGoods: z.string().trim().max(600).optional(),
});

// The refund policy's commercial numbers. Unlike the terms clauses these have
// a real published default, so an empty field means "keep publishing what is
// already there" rather than "leave it blank" — resolveRefunds() decides that,
// not this schema.
const refundsSchema = z.object({
  cancellationTiers: z
    .array(
      z.object({
        window: z.string().trim().max(200),
        outcome: z.string().trim().max(200),
      }),
    )
    .max(8)
    .optional(),
  securityDeposit: z.string().trim().max(800).optional(),
  lateReturnCharge: z.string().trim().max(800).optional(),
  damageRule: z.string().trim().max(800).optional(),
});

const bodySchema = z.object({
  legal: legalSchema.optional(),
  terms: termsSchema.optional(),
  refunds: refundsSchema.optional(),
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
  const terms = content.terms ?? {};
  // Resolved, not raw: the editor should open showing the policy that is
  // actually published, so an owner who has never touched it sees the live
  // wording rather than empty boxes they might then save over.
  const refunds = resolveRefunds(content.refunds);
  return NextResponse.json({
    legal,
    terms,
    refunds,
    missing: missingFactsFor(legal),
    missingClauses: missingClauses(terms),
  });
}

export async function PUT(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  // Accepts either block, or both. The two screens are one save button for the
  // owner and there is no reason to make them two round trips.
  const parsed = bodySchema.safeParse(body);
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

  const legal = { ...(content.legal ?? {}), ...(parsed.data.legal ?? {}) };
  const terms = { ...(content.terms ?? {}), ...(parsed.data.terms ?? {}) };
  const refunds = { ...(content.refunds ?? {}), ...(parsed.data.refunds ?? {}) };
  await saveContent({ ...content, legal, terms, refunds });

  try {
    const { getPrivileged, hasServiceRole } = await import("@/lib/supabase/admin");
    const { audit } = await import("@/lib/admin/audit");
    if (hasServiceRole()) {
      // WHICH fields changed, never the values: a BRN and a registered address
      // are the identity documents of the business, and the audit log is not
      // where a second copy of them should accumulate.
      const changed = [
        ...Object.keys(parsed.data.legal ?? {}).map((k) => `legal.${k}`),
        ...Object.keys(parsed.data.terms ?? {}).map((k) => `terms.${k}`),
        ...Object.keys(parsed.data.refunds ?? {}).map((k) => `refunds.${k}`),
      ];
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
  revalidatePath("/legal/terms");
  revalidatePath("/legal/refunds");
  revalidatePath("/");

  return NextResponse.json({
    legal,
    terms,
    refunds: resolveRefunds(refunds),
    missing: missingFactsFor(legal),
    missingClauses: missingClauses(terms),
  });
}
