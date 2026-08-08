import { NextRequest, NextResponse } from 'next/server';
import { verifyPassword, getSessionValue, COOKIE_NAME, SESSION_TTL_MS } from '@/lib/auth';
import { guardShared } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  // Brute-force protection: 5 attempts per 5 minutes per IP
  const limited = await guardShared(req, 'admin-login', 5, 5 * 60_000);
  if (limited) return limited;

  try {
    const { password } = (await req.json()) as { password?: string };
    if (!password || !verifyPassword(password)) {
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }
    const res = NextResponse.json({ success: true });
    res.cookies.set(COOKIE_NAME, getSessionValue(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.floor(SESSION_TTL_MS / 1000), // matches server-side TTL (30 days)
      path: '/',
    });
    return res;
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
