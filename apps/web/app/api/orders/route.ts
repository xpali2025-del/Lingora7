import { NextResponse } from 'next/server';
import { createOrder } from '@lingora/shared';
import { db, fail, limit, ipHash, jsonBody, verifyCaptcha } from '@/lib/server';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    await limit(req, 'orders', 10, 600);
    const b = await jsonBody(req);
    await verifyCaptcha(req, b.captcha);
    // Only the market code is read from the client: the price is always taken from the database.
    const o = await createOrder(db(), { marketCode: String(b.market || ''), ipHash: ipHash(req) });
    return NextResponse.json(o);
  } catch (e) { return fail(e); }
}
