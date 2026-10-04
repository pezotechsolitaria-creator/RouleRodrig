import { NextRequest, NextResponse } from "next/server";
import { editorSessionFor, EDITOR_COOKIE, EDITOR_TTL_MS } from "@/lib/world-docs/access";
import { guardShared } from "@/lib/rate-limit";

// The editors' door. Separate from /api/admin/login on purpose: the owner's
// session is the credential for the whole platform, and an editor code must not
// be able to mint one. Nothing here can produce an `rr_admin` cookie.

export async function POST(req: NextRequest) {
  // ── A CODE IS A PASSWORD (architecture review 2026-09-30, item 4) ─────────
  // This was the one sign-in with no limit at all, so an editor code could be
  // guessed as fast as the network allowed — and a code publishes a world's
  // content. Same budget as /api/admin/login, counted before the body is even
  // read: 5 attempts per 5 minutes per IP, shared across instances when
  // Upstash is configured.
  const limited = await guardShared(req, "worlds-signin", 5, 5 * 60_000);
  if (limited) return limited;

  let code = "";
  try {
    const body = (await req.json()) as { code?: string };
    code = typeof body.code === "string" ? body.code : "";
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!code) return NextResponse.json({ error: "Enter your editor code." }, { status: 400 });

  const session = editorSessionFor(code);
  if (!session) {
    // One message for "no such code" and "wrong code" — telling them apart is
    // free reconnaissance.
    return NextResponse.json({ error: "That code was not recognised." }, { status: 401 });
  }

  const res = NextResponse.json({
    success: true,
    name: session.entry.name,
    worlds: session.entry.worlds,
  });
  res.cookies.set(EDITOR_COOKIE, session.value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(EDITOR_TTL_MS / 1000),
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(EDITOR_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
