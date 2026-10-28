import { NextResponse } from 'next/server';
import { createTopupRequest } from '@lingora/shared';
import { db, fail, limit, jsonBody, verifyCaptcha, originOk } from '@/lib/server';
export const dynamic = 'force-dynamic';

/** A customer who cannot pay in USDT asks the owner to add balance. Nothing is credited until the owner confirms the payment arrived. */
export async function POST(req: Request) {
  try {
    if (!originOk(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
    await limit(req, 'topups', 5, 3600);
    const b = await jsonBody(req); await verifyCaptcha(req, b.captcha);
    const r = await createTopupRequest(db(), { email: String(b.email || ''), name: String(b.name || ''), contact: String(b.contact || ''), method: String(b.method || ''), amountHint: String(b.amountHint || ''), note: String(b.note || '') });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) { return fail(e); }
}
