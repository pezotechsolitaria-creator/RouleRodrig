import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { guard } from "@/lib/rate-limit";

// Public: list active taxi drivers, featured first.
export async function GET(req: NextRequest) {
  const limited = guard(req, "taxi", 60, 60_000);
  if (limited) return limited;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("taxi_drivers")
    .select("*")
    .eq("active", true)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
