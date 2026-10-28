import { NextResponse } from 'next/server';
import { consumeLoginToken, upsertCustomer, createCustomerSession } from '@lingora/shared';
import { db, fail, limit, jsonBody, originOk, clientIp, safeNext, CUST_COOKIE, custCookieOpts } from '@/lib/server';
export const dynamic = 'force-dynamic';

/** POST (not GET) so mail scanners that pre-open links cannot burn the one-time token. The /account/login/ page posts here. */
export async function POST(req: Request) {
  try {
    if (!originOk(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
    await limit(req, 'login_verify', 20, 900);
    const b = await jsonBody(req);
    const email = await consumeLoginToken(db(), String(b.token || ''));
    const c = await upsertCustomer(db(), { email });
    const token = await createCustomerSession(db(), { customerId: c.id, ip: clientIp(req), ua: req.headers.get('user-agent') });
    const res = NextResponse.json({ ok: true, next: safeNext(b.next) });
    res.cookies.set(CUST_COOKIE, token, custCookieOpts(30 * 86400)); return res;
  } catch (e) { return fail(e); }
}
