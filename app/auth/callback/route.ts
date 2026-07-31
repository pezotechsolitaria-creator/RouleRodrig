import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Google OAuth and email magic-links both land here with a `code`. We exchange
// it for a session (cookies are set by the SSR client) and forward to /merchant.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/merchant";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/merchant/login?error=auth`);
}
