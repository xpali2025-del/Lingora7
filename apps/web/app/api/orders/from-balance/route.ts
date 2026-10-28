import { NextResponse } from 'next/server';
import { createOrderFromBalance, CommerceError } from '@lingora/shared';
import { db, key32, fail, limit, ipHash, jsonBody, originOk, currentCustomer } from '@/lib/server';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    if (!originOk(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
    await limit(req, 'orders_balance', 10, 600);
    const c = await currentCustomer(); if (!c) throw new CommerceError('not_found');
    const b = await jsonBody(req);
    // Only the market code comes from the client; the price is read from the database and the money from the signed-in wallet.
    return NextResponse.json(await createOrderFromBalance(db(), { customerId: c.id, marketCode: String(b.market || ''), key32: key32(), ipHash: ipHash(req) }));
  } catch (e) { return fail(e); }
}
