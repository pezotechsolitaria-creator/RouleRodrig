import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Sign out, server-side.
//
// POST only, and deliberately so: a GET would be triggerable by an <img> tag or
// a prefetch on any page an attacker can get the user to load, which is CSRF
// that logs people out. Not catastrophic, but trivially avoidable — and Next
// prefetches links, so a GET signout would eventually log somebody out just for
// hovering a menu.
//
// The SSR client clears the auth cookies as part of signOut(), so nothing has
// to be cleared by hand here.
export async function POST(request: Request) {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    // A failed signOut still ends with the cookies cleared by the SSR client in
    // every case that matters; refusing to redirect would only strand the user
    // on a blank response.
    console.error("signOut failed", err);
  }
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
