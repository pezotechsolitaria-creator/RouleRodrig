import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAdminApi, readJson, failed } from "@/lib/admin/api-guard";
import { EsimError } from "@/lib/esim/service";
import {
  readDesk,
  syncCatalog,
  updatePlan,
  retryOrder,
  resendEmail,
  refundOrder,
  customerLink,
  registerWebhook,
  setListing,
  curateOne,
  curateAll,
} from "@/lib/esim/admin";

// The owner's eSIM desk (/admin/esim). One GET for everything on the screen,
// one POST with an `action` for everything the screen can do.

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const gate = await guardAdminApi(req, "The eSIM desk");
  if (gate instanceof NextResponse) return gate;
  try {
    const country = new URL(req.url).searchParams.get("country") ?? "MU";
    return NextResponse.json(await readDesk(gate.admin, country.toUpperCase()), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failed(e, "Failed to load the eSIM desk");
  }
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }),
  z.object({ action: z.literal("webhook") }),
  z.object({
    action: z.literal("plan"),
    id: z.string().uuid(),
    retail_eur_cents: z.number().int().optional(),
    active: z.boolean().optional(),
    badge: z.enum(["popular", "best_value", "short_trip", "long_stay"]).nullable().optional(),
    sort_order: z.number().int().optional(),
  }),
  z.object({ action: z.enum(["retry", "resend", "refund", "link"]), id: z.string().uuid() }),
  // M224 — destination shelves.
  z.object({
    action: z.literal("listing"),
    country: z.string().regex(/^[A-Za-z]{2}$/),
    planId: z.string().uuid(),
    listed: z.boolean(),
    badge: z.enum(["popular", "best_value", "short_trip", "long_stay"]).nullable().optional(),
    sort: z.number().int().optional(),
  }),
  // "Reset to automatic" for one destination, or re-curate every automatic one.
  z.object({ action: z.literal("curate"), country: z.string().regex(/^[A-Za-z]{2}$/).optional() }),
]);

export async function POST(req: NextRequest) {
  const gate = await guardAdminApi(req, "The eSIM desk");
  if (gate instanceof NextResponse) return gate;
  const raw = await readJson(req);
  if (raw instanceof NextResponse) return raw;
  const parsed = action.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const a = parsed.data;
  try {
    switch (a.action) {
      case "sync":
        return NextResponse.json(await syncCatalog(gate.admin));
      case "webhook":
        return NextResponse.json(await registerWebhook());
      case "plan": {
        const { id, action: _a, ...patch } = a;
        void _a;
        await updatePlan(gate.admin, id, patch);
        return NextResponse.json({ ok: true });
      }
      case "retry":
        return NextResponse.json(await retryOrder(a.id));
      case "resend":
        return NextResponse.json(await resendEmail(a.id));
      case "refund":
        return NextResponse.json(await refundOrder(gate.admin, a.id));
      case "link":
        return NextResponse.json(await customerLink(a.id));
      case "listing":
        await setListing(gate.admin, { country: a.country, planId: a.planId, listed: a.listed, badge: a.badge, sort: a.sort });
        return NextResponse.json({ ok: true });
      case "curate":
        return NextResponse.json(
          a.country ? { [a.country.toUpperCase()]: await curateOne(gate.admin, a.country.toUpperCase(), { reset: true }) } : await curateAll(gate.admin),
        );
    }
  } catch (e) {
    if (e instanceof EsimError) return NextResponse.json({ error: e.publicMessage }, { status: e.status });
    return failed(e, `eSIM desk: ${a.action} failed`);
  }
}
