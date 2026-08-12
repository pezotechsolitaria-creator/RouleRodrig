import { NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/auth";
import { getPrivileged, hasServiceRole } from "@/lib/supabase/admin";
import { containsPattern, isSearchable } from "@/lib/admin/ops";
import { bookingReference } from "@/lib/activity";

// ── Global admin search ─────────────────────────────────────────────────────
//
// One box that finds the thing, whatever table it lives in: type "RR1024" or
// "Jean" or "ourite" and get orders, bookings, customers, products, shops and
// drivers — each with a link to the screen that manages it.
//
// AUTH: same posture as every /api/admin route — the signed cookie IS the
// boundary, the service role is how the reads land (several of these tables
// have no anon/authenticated SELECT at all, by design).
//
// INPUT: user text never reaches an ilike pattern raw. `%` matched every row
// in M11 and would return whole tables here; containsPattern() escapes it.

export type SearchHit = {
  group: "Orders" | "Bookings" | "Customers" | "Products" | "Shops & kitchens" | "Drivers";
  title: string;
  subtitle: string;
  href: string;
};

const LIMIT_PER_GROUP = 5;

export async function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasServiceRole()) {
    return NextResponse.json({ error: "Search is not configured (service role missing)." }, { status: 503 });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!isSearchable(q)) return NextResponse.json({ hits: [] });

  const admin = await getPrivileged();
  const pat = containsPattern(q);
  const hits: SearchHit[] = [];

  // A reference like RR-A1B2C3 is hex of a uuid — searchable only by prefix
  // reconstruction, so normalise it once and match ids in code below.
  const refHex = q.replace(/^rr-?/i, "").toLowerCase();
  const looksLikeRef = /^[0-9a-f]{4,8}$/.test(refHex);

  const [orders, bookings, places, products, stores, drivers] = await Promise.all([
    admin
      .from("orders")
      .select("id, order_number, status, total, customer_name, store_id, stores(name)")
      .or(`order_number.ilike.${pat},customer_name.ilike.${pat},customer_email.ilike.${pat}`)
      .order("created_at", { ascending: false })
      .limit(LIMIT_PER_GROUP),
    admin
      .from("bookings")
      .select("id, name, email, scooter, start_date, status")
      .or(`name.ilike.${pat},email.ilike.${pat}`)
      .order("created_at", { ascending: false })
      .limit(LIMIT_PER_GROUP),
    admin
      .from("place_bookings")
      .select("id, name, email, place_name, start_date, status")
      .or(`name.ilike.${pat},email.ilike.${pat},place_name.ilike.${pat}`)
      .order("created_at", { ascending: false })
      .limit(LIMIT_PER_GROUP),
    admin
      .from("products")
      .select("id, name, status, store_id, stores(name)")
      .ilike("name", pat)
      .limit(LIMIT_PER_GROUP),
    admin
      .from("stores")
      .select("id, name, slug, status")
      .ilike("name", pat)
      .limit(LIMIT_PER_GROUP),
    admin
      .from("delivery_drivers")
      .select("id, full_name, phone, status")
      .or(`full_name.ilike.${pat},phone.ilike.${pat}`)
      .limit(LIMIT_PER_GROUP),
  ]);

  const one = (v: unknown) => (Array.isArray(v) ? (v[0] ?? null) : v);

  for (const o of (orders.data ?? []) as Record<string, unknown>[]) {
    hits.push({
      group: "Orders",
      title: String(o.order_number ?? "Order"),
      subtitle: `${(one(o.stores) as { name?: string } | null)?.name ?? "—"} · ${o.status} · ${o.customer_name ?? "guest"}`,
      href: "/admin/food",
    });
  }

  for (const b of (bookings.data ?? []) as Record<string, unknown>[]) {
    hits.push({
      group: "Bookings",
      title: `${bookingReference(String(b.id))} — ${b.scooter ?? "rental"}`,
      subtitle: `${b.name ?? ""} · ${b.start_date ?? ""} · ${b.status}`,
      href: "/admin/content#bookings",
    });
  }
  for (const b of (places.data ?? []) as Record<string, unknown>[]) {
    hits.push({
      group: "Bookings",
      title: `${bookingReference(String(b.id))} — ${b.place_name ?? "experience"}`,
      subtitle: `${b.name ?? ""} · ${b.start_date ?? ""} · ${b.status}`,
      href: "/admin/content#place_bookings",
    });
  }

  // Customers live in auth.users, which has no SQL search surface — but there
  // are ten of them, so listing and filtering in code is the honest O(n).
  if (q.includes("@") || /^[a-z]/i.test(q)) {
    try {
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const needle = q.toLowerCase();
      for (const u of (list?.users ?? []).filter((u) => u.email?.toLowerCase().includes(needle)).slice(0, LIMIT_PER_GROUP)) {
        hits.push({
          group: "Customers",
          title: u.email ?? u.id,
          subtitle: `Joined ${new Date(u.created_at).toLocaleDateString("en-GB")}`,
          href: `/admin/customers?q=${encodeURIComponent(u.email ?? "")}`,
        });
      }
    } catch (err) {
      console.error("admin search: listUsers failed", err);
    }
  }

  for (const p of (products.data ?? []) as Record<string, unknown>[]) {
    hits.push({
      group: "Products",
      title: String(p.name),
      subtitle: `${(one(p.stores) as { name?: string } | null)?.name ?? "—"} · ${p.status}`,
      href: "/admin/stores",
    });
  }
  for (const s of (stores.data ?? []) as Record<string, unknown>[]) {
    hits.push({
      group: "Shops & kitchens",
      title: String(s.name),
      subtitle: `${s.slug} · ${s.status}`,
      href: "/admin/stores",
    });
  }
  for (const d of (drivers.data ?? []) as Record<string, unknown>[]) {
    hits.push({
      group: "Drivers",
      title: String(d.full_name ?? "Driver"),
      subtitle: `${d.phone ?? ""} · ${d.status}`,
      href: "/admin/deliveries",
    });
  }

  // A pasted booking reference should also find its row even though the ref is
  // derived from the uuid rather than stored.
  if (looksLikeRef && !hits.some((h) => h.group === "Bookings")) {
    const [vb, pb] = await Promise.all([
      admin.from("bookings").select("id, name, scooter, start_date, status").limit(400),
      admin.from("place_bookings").select("id, name, place_name, start_date, status").limit(400),
    ]);
    for (const b of (vb.data ?? []) as Record<string, unknown>[]) {
      if (String(b.id).replace(/-/g, "").toLowerCase().startsWith(refHex)) {
        hits.push({
          group: "Bookings",
          title: `${bookingReference(String(b.id))} — ${b.scooter ?? "rental"}`,
          subtitle: `${b.name ?? ""} · ${b.start_date ?? ""} · ${b.status}`,
          href: "/admin/content#bookings",
        });
      }
    }
    for (const b of (pb.data ?? []) as Record<string, unknown>[]) {
      if (String(b.id).replace(/-/g, "").toLowerCase().startsWith(refHex)) {
        hits.push({
          group: "Bookings",
          title: `${bookingReference(String(b.id))} — ${b.place_name ?? "experience"}`,
          subtitle: `${b.name ?? ""} · ${b.start_date ?? ""} · ${b.status}`,
          href: "/admin/content#place_bookings",
        });
      }
    }
  }

  return NextResponse.json({ hits: hits.slice(0, 24) });
}
