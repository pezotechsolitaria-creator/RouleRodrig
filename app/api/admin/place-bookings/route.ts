import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { getPrivileged } from '@/lib/supabase/admin';
import { PAYMENT_WINDOW_HOURS } from '@/lib/holds';
import { sendPlaceAvailabilityConfirmed, sendPlaceUnavailable } from '@/lib/email';

// ── THE OWNER DECIDES AVAILABILITY, AND THE CUSTOMER IS TOLD (M127) ────────
//
// Until now this route took whatever string it was handed and wrote it to the
// status column. No validation — so a typo ("aproved") created a booking in a
// state nothing understands — and no email, so the customer learned the outcome
// only if somebody remembered to message them.
//
// The lifecycle now mirrors vehicles (M91), because the reason is the same: the
// boats and guesthouses are not his, and confirming one he cannot get means
// taking money and giving it back.
//
//   pending      → waiting on him. Holds nothing.
//   approved     → he got it. RESERVES the slot until payment_due_by, and the
//                  customer is emailed a deadline they can act on.
//   unavailable  → he could not. Holds nothing, and the customer is emailed
//                  his own note with alternatives rather than left in silence.
//
// A customer told "we are checking" who then hears nothing is worse off than
// under the old pay-immediately flow, because at least that one ended. So the
// email is not decoration on this route — it is the point of it.

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'approved', 'confirmed', 'unavailable', 'cancelled', 'completed']),
  /** The owner's own words when declining — emailed to the customer verbatim. */
  note: z.string().trim().max(600).optional(),
  /** Lets him give longer than the default when a customer needs it. */
  payWithinHours: z.number().int().min(1).max(336).optional(),
});

/** What the customer asked for, in words they will recognise in an email. */
function whenLabel(b: { start_date?: string | null; end_date?: string | null; time_slot?: string | null }): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const start = b.start_date ? fmt(b.start_date) : null;
  const end = b.end_date && b.end_date !== b.start_date ? fmt(b.end_date) : null;
  const dates = start ? (end ? `${start} → ${end}` : start) : 'your dates';
  return b.time_slot ? `${dates} at ${b.time_slot}` : dates;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from('place_bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const { id, status, note, payWithinHours } = parsed.data;

  const supabase = await getPrivileged();

  // Read BEFORE writing: the email needs the customer's name, what they asked
  // for and what it costs, and none of that is in the request body.
  const { data: current, error: readErr } = await supabase
    .from('place_bookings')
    .select('id, name, email, place_name, category, start_date, end_date, time_slot, deposit_amount, status')
    .eq('id', id)
    .maybeSingle();

  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!current) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const patch: Record<string, unknown> = { status };

  if (status === 'approved') {
    // The deadline is what makes an approved-but-unpaid booking safe to let
    // reserve the slot. Without it the hold is open-ended and one customer who
    // never pays blocks the calendar forever.
    const hours = payWithinHours ?? PAYMENT_WINDOW_HOURS;
    patch.payment_due_by = new Date(Date.now() + hours * 3600_000).toISOString();
    patch.availability_checked_at = new Date().toISOString();
  }

  if (status === 'unavailable') {
    patch.unavailable_note = note ?? null;
    patch.availability_checked_at = new Date().toISOString();
    // Nothing is held by an unavailable row, so the deadline is meaningless and
    // leaving it set would show a stale countdown on every screen that reads it.
    patch.payment_due_by = null;
  }

  const { error } = await supabase.from('place_bookings').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Tell the customer ───────────────────────────────────────────────────
  //
  // Awaited, not left floating: this runs in a serverless function that is
  // killed the moment the handler resolves. The outcome is reported back rather
  // than swallowed, because "he pressed Available and she was never told" is
  // the exact failure this feature exists to prevent — but it never rolls back
  // the status, which he has already acted on with a partner.
  let emailed: boolean | null = null;
  if (status === 'approved' || status === 'unavailable') {
    try {
      const common = {
        id: current.id as string,
        email: (current.email as string | null) ?? null,
        name: (current.name as string) || 'there',
        placeName: (current.place_name as string) || 'your booking',
        category: (current.category as string | null) ?? null,
        when: whenLabel(current as Record<string, string | null>),
      };
      emailed =
        status === 'approved'
          ? await sendPlaceAvailabilityConfirmed({
              ...common,
              amountDue: typeof current.deposit_amount === 'number' ? current.deposit_amount : null,
              payBy: patch.payment_due_by as string,
            })
          : await sendPlaceUnavailable({ ...common, note: note ?? null });
    } catch (err) {
      console.error('place-booking availability email failed', err);
      emailed = false;
    }
  }

  // `emailed: false` for a guest who gave no address is normal, not a fault —
  // the admin screen says which, so he knows whether to pick up the phone.
  return NextResponse.json({
    ok: true,
    emailed,
    hasEmail: !!current.email,
    paymentDueBy: (patch.payment_due_by as string | null) ?? null,
  });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = await getPrivileged();
  const { error } = await supabase.from('place_bookings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
