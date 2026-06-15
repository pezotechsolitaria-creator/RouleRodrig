import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Public: list active taxi drivers, featured first.
export async function GET() {
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
