import crypto from 'crypto';

export const COOKIE_NAME = 'rr_admin';
const SALT = 'roule-rodrigues-admin-2024';

function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? 'admin2024';
}

export function hashPassword(password: string): string {
  return crypto.createHmac('sha256', SALT).update(password).digest('hex');
}

export function getSessionValue(): string {
  return hashPassword(getAdminPassword());
}

export function verifyPassword(input: string): boolean {
  return input === getAdminPassword();
}

export function verifySession(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  const expected = getSessionValue();
  if (cookieValue.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(cookieValue, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}
