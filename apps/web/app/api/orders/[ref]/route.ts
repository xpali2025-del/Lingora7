import { NextResponse, after } from 'next/server';
import { getOrderForClient } from '@lingora/shared';
import { db, fail, limit } from '@/lib/server';
import { runTick } from '@/lib/tick';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit(req, 'order_get', 120, 600);
    const { ref } = await params;
    const o = await getOrderForClient(db(), ref, req.headers.get('x-order-key') || '');
    if (!o) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    // No always-on worker on free hosting: while someone is waiting on this order, run (at most) one background pass every ~20 s.
    if (['awaiting_payment', 'paid_unconfirmed', 'ready_to_fulfil'].includes(o.status)) after(async () => { try { await runTick(20); } catch (e) { console.warn('opportunistic tick:', (e as Error).message); } });
    return NextResponse.json(o);
  } catch (e) { return fail(e); }
}
