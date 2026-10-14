import { NextResponse } from 'next/server';
import { submitEmail } from '@lingora/shared';
import { db, key32, fail, limit, jsonBody } from '@/lib/server';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  try {
    await limit(req, 'order_email', 20, 600);
    const { ref } = await params; const b = await jsonBody(req);
    const r = await submitEmail(db(), { ref, key: req.headers.get('x-order-key') || '', email: String(b.email || ''), emailConfirm: String(b.emailConfirm || ''), key32: key32() });
    return NextResponse.json(r);
  } catch (e) { return fail(e); }
}
