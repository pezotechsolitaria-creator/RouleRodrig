import "server-only";
import { pushToCustomer } from "@/lib/push/send";
import { balanceRupees, isPayInPerson, rupees, type BookingKind, type MoneyRow } from "@/lib/bookings/in-person";

// Telling a customer their booking changed.
//
// Until now the admin PATCH moved a status and nobody downstream heard: a
// customer whose hire was confirmed — or cancelled — learned nothing after the
// original confirmation email. For a cancellation that is the difference
// between them rearranging their day and turning up to no scooter.
//
// Never throws. The status change is already committed; a silent phone must not
// turn a successful admin action into an error.

const REF = (id: string) => "RR-" + id.replace(/-/g, "").slice(0, 6).toUpperCase();

// Written for the person reading it on a lock screen, not for the database.
const SAYS: Record<string, { title: string; body: (ref: string) => string }> = {
  confirmed: {
    title: "Booking confirmed",
    body: (ref) => `Your booking ${ref} is confirmed. We'll see you soon.`,
  },
  cancelled: {
    title: "Booking cancelled",
    body: (ref) => `Your booking ${ref} has been cancelled. Get in touch if that's unexpected.`,
  },
  completed: {
    title: "Thanks for riding with us",
    body: (ref) => `Booking ${ref} is complete. We hope you enjoyed Rodrigues.`,
  },
  pending: {
    title: "Booking updated",
    body: (ref) => `Booking ${ref} is being reviewed. We'll confirm shortly.`,
  },
};

// ── CONFIRMED, PAYS IN PERSON (M220) ─────────────────────────────────────────
//
// "Your booking is confirmed. We'll see you soon." is the one line a cash
// customer most needs to be different: it says nothing about money, and the
// only other thing they may have read is a request email about paying online.
// So a booking confirmed as paid in person says where and how to pay, with the
// figure when it is known (what is still owed — lib/bookings/in-person.ts).

/** The lock-screen words for a booking confirmed as paid in person. Pure. */
export function inPersonConfirmedCopy(
  kind: BookingKind,
  ref: string,
  due: number | null,
): { title: string; body: string } {
  const at = kind === "vehicle" ? "at pickup" : "on arrival";
  const title = kind === "vehicle" ? "Confirmed — pay in cash at pickup" : "Confirmed — pay on arrival";
  if (due === 0) return { title: "Booking confirmed", body: `${ref} is confirmed and paid in full. See you soon.` };
  const amount = due ? `${rupees(due)} ` : "";
  return { title, body: `${ref} is confirmed. Pay ${amount}in cash ${at} — nothing to pay online.` };
}

/** Money facts for the confirmed push, read when the caller did not pass them. */
async function readInPerson(kind: BookingKind, id: string): Promise<MoneyRow | null> {
  try {
    const { getPrivileged } = await import("@/lib/supabase/admin");
    const admin = await getPrivileged();
    const { data } =
      kind === "place"
        ? await admin.from("place_bookings").select("status, pay_in_person, deposit_amount, amount_paid").eq("id", id).maybeSingle()
        : await admin.from("bookings").select("status, pay_in_person, total_amount, amount_paid").eq("id", id).maybeSingle();
    return (data as MoneyRow | null) ?? null;
  } catch {
    // A failed read costs the amount, not the notification.
    return null;
  }
}

export async function notifyBookingStatus(opts: {
  id: string;
  email: string | null | undefined;
  status: string;
  /** Which table the id is in. The admin rentals desk is the default caller. */
  kind?: BookingKind;
  /** M220. When omitted on a confirmation, the row is read to find out. */
  payInPerson?: boolean;
  /** WHOLE RUPEES still owed, when the caller already knows it. */
  balanceRupees?: number | null;
}): Promise<void> {
  try {
    if (!opts.email) return;
    const copy = SAYS[opts.status];
    // An unrecognised status is not worth waking a phone for — silence beats a
    // notification that says "your booking is now: dispatched_v2".
    if (!copy) return;

    const ref = REF(opts.id);
    const kind: BookingKind = opts.kind ?? "vehicle";
    let title = copy.title;
    let body = copy.body(ref);

    if (opts.status === "confirmed") {
      let inPerson = opts.payInPerson;
      let due = opts.balanceRupees;
      if (inPerson === undefined || (inPerson && due === undefined)) {
        const row = await readInPerson(kind, opts.id);
        if (inPerson === undefined) inPerson = row ? isPayInPerson(row) : false;
        if (due === undefined) due = row ? balanceRupees(kind, row) : null;
      }
      if (inPerson) ({ title, body } = inPersonConfirmedCopy(kind, ref, due ?? null));
    }

    await pushToCustomer(
      { email: opts.email },
      {
        title,
        body,
        url: "/manage-booking",
        // Per booking, so repeated changes replace rather than stack.
        tag: `booking:${ref}`,
      },
    );
  } catch (err) {
    console.error("notifyBookingStatus failed", { id: opts.id, err });
  }
}
