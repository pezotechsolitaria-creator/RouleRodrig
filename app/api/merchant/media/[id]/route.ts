import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnStoreId } from "@/lib/merchant/context";
import { isUuid } from "@/lib/file-signature";
import { guard } from "@/lib/rate-limit";

// Removes a single product photo — both the DB row and the underlying
// storage object (M2 left an orphaned test file behind when this only
// existed as an insert-only endpoint; deleting the object here closes that).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = guard(req, "merchant-media-delete", 30, 60_000);
  if (limited) return limited;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const storeId = await getOwnStoreId(supabase);
  if (!storeId) return NextResponse.json({ error: "No shop found for this account." }, { status: 404 });

  // Ownership by construction: join through product_id → store_id, scoped to
  // the caller's own store. RLS (media_write) enforces this independently.
  const { data: media } = await supabase
    .from("product_media")
    .select("id, url, products!inner(store_id)")
    .eq("id", id)
    .eq("products.store_id", storeId)
    .maybeSingle();

  if (!media) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { error: deleteError } = await supabase.from("product_media").delete().eq("id", id);
  if (deleteError) {
    console.error("delete product_media row failed", deleteError);
    return NextResponse.json({ error: "Failed to remove photo." }, { status: 500 });
  }

  // Best-effort storage cleanup — the DB row is already gone (the source of
  // truth for what's attached to the product), so a failure here leaves an
  // orphaned file, not a visible or broken product.
  const marker = "/object/public/merchant-media/";
  const idx = media.url.indexOf(marker);
  if (idx !== -1) {
    const path = decodeURIComponent(media.url.slice(idx + marker.length));
    await supabase.storage.from("merchant-media").remove([path]).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
