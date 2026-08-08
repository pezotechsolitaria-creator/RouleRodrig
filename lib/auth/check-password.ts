// Client-side helper for the password gate at /api/auth/password-check.
//
// Returns a message to SHOW the customer, or null when the password is
// acceptable. Never throws, and treats an unreachable endpoint as acceptable:
// the server has already decided to fail open, and the browser must not be
// stricter than the server or the two would disagree about what is allowed.
export async function checkPassword(password: string): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/password-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    // 429 or any non-OK: do not block a legitimate sign-up on our own limiter.
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; message?: string };
    if (body.ok === false && body.message) return body.message;
    return null;
  } catch {
    return null;
  }
}
