import "server-only";
import { pushToCustomer } from "@/lib/push/send";

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

export async function notifyBookingStatus(opts: {
  id: string;
  email: string | null | undefined;
  status: string;
}): Promise<void> {
  try {
    if (!opts.email) return;
    const copy = SAYS[opts.status];
    // An unrecognised status is not worth waking a phone for — silence beats a
    // notification that says "your booking is now: dispatched_v2".
    if (!copy) return;

    const ref = REF(opts.id);
    await pushToCustomer(
      { email: opts.email },
      {
        title: copy.title,
        body: copy.body(ref),
        url: "/manage-booking",
        // Per booking, so repeated changes replace rather than stack.
        tag: `booking:${ref}`,
      },
    );
  } catch (err) {
    console.error("notifyBookingStatus failed", { id: opts.id, err });
  }
}
