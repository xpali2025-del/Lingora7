import { NextResponse } from 'next/server';
import { getOrderForClient } from '@lingora/shared';
import { db, fail, limit } from '@/lib/server';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit(req, 'order_get', 120, 600);
    const { ref } = await params;
    const o = await getOrderForClient(db(), ref, req.headers.get('x-order-key') || '');
    if (!o) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(o);
  } catch (e) { return fail(e); }
}
