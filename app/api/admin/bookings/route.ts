import { NextRequest, NextResponse } from 'next/server';
import { verifySession, COOKIE_NAME } from '@/lib/auth';
import { getPrivileged } from '@/lib/supabase/admin';
import { notifyBookingStatus } from '@/lib/notifications/booking-status';

function isAuthed(req: NextRequest) {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
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
    .select('email, status')
    .eq('id', body.id)
    .maybeSingle();

  const { error } = await supabase.from('bookings').update(patch).eq('id', body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Only on a REAL status change. Best-effort: the update is already committed,
  // and a silent phone must not turn a successful action into an error.
  if (body.status && before && body.status !== (before as { status?: string }).status) {
    await notifyBookingStatus({
      id: body.id,
      email: (before as { email?: string | null }).email,
      status: body.status,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = await getPrivileged();
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
