import { NextResponse } from 'next/server';
import { loginPassword, AdminError, rateLimit, isKnownIp } from '@lingora/shared';
import { db, clientIp, originOk, redirectTo } from '@/lib/server';
import { COOKIE, cookieOpts } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (!originOk(req)) return new NextResponse('bad origin', { status: 403 });
  const ip = clientIp(req);
  if (!isKnownIp(ip)) return redirectTo(req, '/admin/login/?e=locked');   // fail closed without a trustworthy client IP
  if (!(await rateLimit(db(), `admin_login:${ip}`, 20, 900))) return redirectTo(req, '/admin/login/?e=locked');
  const f = await req.formData();
  try {
    const { token } = await loginPassword(db(), { email: String(f.get('email') || ''), password: String(f.get('password') || ''), ip, ua: req.headers.get('user-agent') });
    const res = redirectTo(req, '/admin/2fa/');
    res.cookies.set(COOKIE, token, cookieOpts(600)); return res;
  } catch (e: any) {
    if (e instanceof AdminError) return redirectTo(req, '/admin/login/?e=' + (e.code === 'locked' ? 'locked' : 'bad'));
    throw e;
  }
}
