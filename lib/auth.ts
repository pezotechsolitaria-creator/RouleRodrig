import crypto from 'crypto';

export const COOKIE_NAME = 'rr_admin';
const SALT = 'roule-rodrigues-admin-2024';

// Sessions expire server-side after this window (cookie maxAge should match).
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getAdminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (pw && pw.length > 0) return pw;
  // No insecure default in production — refuse all auth until ADMIN_PASSWORD
  // is configured. (A hard-coded default + known salt would let anyone forge
  // an admin session.) The default is allowed only for local development.
  if (process.env.NODE_ENV === 'production') return '';
  return 'admin2024';
}

// HMAC key: a dedicated SESSION_SECRET if provided, else the legacy salt.
// Setting SESSION_SECRET lets you invalidate every session by rotating it.
function signingKey(): string {
  return process.env.SESSION_SECRET || SALT;
}

export function verifyPassword(input: string): boolean {
  const expected = getAdminPassword();
  if (!expected) return false; // not configured → deny all
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  // Length check first (timingSafeEqual throws on length mismatch), then a
  // constant-time compare to avoid leaking the password via response timing.
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// Session token = `${issuedAt}.${hmac}`. Binding the timestamp means the token
// rotates on every login and can expire server-side; binding the password means
// changing ADMIN_PASSWORD instantly invalidates all existing sessions.
function sign(issuedAt: number): string {
  const h = crypto
    .createHmac('sha256', signingKey())
    .update(`${issuedAt}.${getAdminPassword()}`)
    .digest('hex');
  return `${issuedAt}.${h}`;
}

export function getSessionValue(): string {
  return sign(Date.now());
}

export function verifySession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  if (!getAdminPassword()) return false; // not configured → deny everything

  const dot = cookieValue.indexOf('.');
  if (dot <= 0) return false;

  const issuedAt = Number(cookieValue.slice(0, dot));
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > SESSION_TTL_MS) return false;   // expired
  if (issuedAt > Date.now() + 60_000) return false;           // future-dated → reject

  const expected = sign(issuedAt);
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
