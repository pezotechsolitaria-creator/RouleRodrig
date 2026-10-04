import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { getPrivileged } from '@/lib/supabase/admin';
import { notifyBookingStatus } from '@/lib/notifications/booking-status';
import { sendPaymentReceipt } from '@/lib/receipts/payment-receipt';
import { audit } from '@/lib/admin/audit';
import { deleteBookingIfUnpaid } from '@/lib/admin/booking-delete-server';

// Every status the rest of the code understands. The column has no CHECK, and
// this route used to write any string it was sent — a typo created a booking
// in a state no screen, hold or reminder knows.
const VEHICLE_STATUSES = new Set(['pending', 'approved', 'confirmed', 'cancelled', 'completed']);

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

type PriorMoney = {
  status?: string | null;
  deposit_amount?: number | null;
  deposit_paid_at?: string | null;
};

/**
 * "Confirmed" from the pill = the bank transfer arrived. Write that deposit
 * (WHOLE RUPEES) as a bank_transfer row in the ledger when nothing is recorded
 * yet. Best-effort: the status is already committed and the owner has acted
 * on it, so a refusal (more than the total, say) is logged, never thrown.
 */
async function recordTransferOnConfirm(supabase: SupabaseClient, id: string, before: PriorMoney) {
  const deposit = typeof before.deposit_amount === 'number' ? Math.round(before.deposit_amount) : 0;
  if (before.deposit_paid_at || deposit <= 0 || before.status === 'completed') return;
  try {
    const { data, error } = await supabase.rpc('admin_record_booking_payment', {
      p_kind: 'vehicle',
      p_id: id,
      p_amount_rupees: deposit,
      p_method: 'bank_transfer',
      p_note: 'Recorded when confirmed from the desk',
    });
    if (error) {
      console.error('confirm: could not record the transfer in the ledger', { id, deposit, error });
      return;
    }
    const r = (data ?? {}) as { paid?: number; balance?: number };
    await audit(supabase, {
      action: 'booking.payment',
      entityType: 'booking',
      entityId: id,
      diff: {
        amountRupees: deposit,
        method: 'bank_transfer',
        via: 'status_confirmed',
        paidAfterRupees: r.paid ?? null,
        balanceAfterRupees: r.balance ?? null,
      },
    });
  } catch (err) {
    console.error('confirm: recording the transfer threw', { id, err });
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await getPrivileged();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { id: string; status?: string; asset_id?: string | null; asset_label?: string | null };
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  if (body.status && !VEHICLE_STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.status) patch.status = body.status;
  if ('asset_id' in body) patch.asset_id = body.asset_id;
  if ('asset_label' in body) patch.asset_label = body.asset_label;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const supabase = await getPrivileged();
  // Read the current status first: a PATCH that only sets an asset label must
  // not fire a "booking confirmed" alert, and after the update the old value
  // is gone.
  const { data: before } = await supabase
    .from('bookings')
    .select('email, status, pay_in_person, deposit_amount, deposit_paid_at')
    .eq('id', body.id)
    .maybeSingle();

  const { error } = await supabase.from('bookings').update(patch).eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only on a REAL status change. Best-effort: the update is already committed,
  // and a silent phone must not turn a successful action into an error.
  if (body.status && before && body.status !== (before as { status?: string }).status) {
    await audit(supabase, {
      action: 'booking.status',
      entityType: 'booking',
      entityId: body.id,
      diff: { from: (before as { status?: string }).status ?? null, to: body.status },
    });

    await notifyBookingStatus({
      id: body.id,
      email: (before as { email?: string | null }).email,
      status: body.status,
    });

    // ── THE RECEIPT FOR A BANK TRANSFER ──────────────────────────────────
    //
    // Reaching `confirmed` from this desk IS the owner saying the money is in
    // his account: the customer declared the transfer, he checked it against
    // his statement, and pressed the button. Until now that produced a push
    // notification and nothing the customer could keep.
    //
    // sendPaymentReceipt refuses a booking with no evidence of payment, so a
    // row confirmed for some other reason is skipped rather than receipted.
    // The router's idempotency key is per booking, so the PayPal path having
    // already sent one cannot produce a second.
    //
    // M220: NOT for a booking paid in person. Its money is recorded through
    // /api/admin/bookings/in-person, which sends a receipt naming the real
    // method — this one would call cash a "Bank transfer".
    if (body.status === 'confirmed' && !(before as { pay_in_person?: boolean }).pay_in_person) {
      // FIRST, the money into the ledger. The pill says the transfer arrived
      // but never wrote an amount, so the desk read "Paid — amount not
      // recorded", the revenue cards left it out and the receipt fell back to
      // deposit_amount. Recorded BEFORE the receipt so it reads amount_paid,
      // through the same RPC as cash (M220/M222) — never a hand-written money
      // column. Not from 'completed': reinstating a finished rental is a
      // correction, and the desk does not ask "has the transfer arrived?" then.
      await recordTransferOnConfirm(supabase, body.id, before as PriorMoney);
      await sendPaymentReceipt(supabase, 'vehicle', body.id, 'Bank transfer');
    }
  }

  return NextResponse.json({ ok: true });
}

// Admin keeps everything (architecture review 2026-09-30, item 3): a booking
// with money, a confirmation, a completion or a no-show on it is refused with
// a sentence the desk shows as it is, and "Cancel" is offered instead. Every
// delete that goes ahead is audited with the row's key fields. The rule and
// the guarded delete live in lib/admin/booking-delete*.ts, shared with the
// reservations desk.
export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = await getPrivileged();
  return deleteBookingIfUnpaid(supabase, 'vehicle', id);
}
