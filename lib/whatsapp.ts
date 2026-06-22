// ── Free owner-only WhatsApp alerts via CallMeBot ───────────────────────────
// https://www.callmebot.com/blog/free-api-whatsapp-messages/
//
// Sends WhatsApp messages ONLY to the owner's opted-in number (the one that
// registered with CallMeBot). It can NEVER message customers, so we only use
// it for internal alerts (new bookings, daily deliver/collect reminders).
//
// No-ops unless CALLMEBOT_APIKEY is set (+ a phone number), so it's safe to
// deploy before configuration. Layered on top of email — if it fails, the
// owner still gets the email alert.

function ownerPhoneDigits(): string {
  const raw =
    process.env.CALLMEBOT_PHONE ||
    process.env.OWNER_WHATSAPP ||
    process.env.OWNER_PHONE ||
    "";
  return raw.replace(/\D/g, "");
}

/** Send a WhatsApp alert to the owner. Returns false (no throw) if unconfigured/fails. */
export async function sendOwnerWhatsApp(text: string): Promise<boolean> {
  const apikey = process.env.CALLMEBOT_APIKEY;
  const digits = ownerPhoneDigits();
  if (!apikey || !digits) return false;
  const url =
    `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent("+" + digits)}` +
    `&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
