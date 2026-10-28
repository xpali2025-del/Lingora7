import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroyCustomerSession } from '@lingora/shared';
import { db, originOk, CUST_COOKIE, custCookieOpts } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (!originOk(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
  const t = (await cookies()).get(CUST_COOKIE)?.value; if (t) await destroyCustomerSession(db(), t);
  const res = NextResponse.json({ ok: true }); res.cookies.set(CUST_COOKIE, '', custCookieOpts(0)); return res;
}
