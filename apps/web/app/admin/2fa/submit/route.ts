import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { loginTotp, AdminError, rateLimit, isKnownIp } from '@lingora/shared';
import { db, key32, clientIp, originOk, redirectTo } from '@/lib/server';
import { COOKIE, cookieOpts } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (!originOk(req)) return new NextResponse('bad origin', { status: 403 });
  const ip = clientIp(req);
  if (!isKnownIp(ip)) return redirectTo(req, '/admin/2fa/?e=1');   // fail closed without a trustworthy client IP
  const token = (await cookies()).get(COOKIE)?.value || '';
  if (!(await rateLimit(db(), `admin_2fa:${ip}`, 10, 900))) return redirectTo(req, '/admin/2fa/?e=1');
  const f = await req.formData();
  try {
    await loginTotp(db(), { token, code: String(f.get('code') || ''), key32: key32(), ip });
    const res = redirectTo(req, '/admin/');
    res.cookies.set(COOKIE, token, cookieOpts(8 * 3600)); return res;
  } catch (e: any) {
    if (e instanceof AdminError) return redirectTo(req, e.code === 'session_expired' ? '/admin/login/' : '/admin/2fa/?e=1');
    throw e;
  }
}
