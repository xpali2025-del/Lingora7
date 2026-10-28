import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeGoogleCode, verifyGoogleIdToken, loginGoogle, upsertCustomer, createCustomerSession, GoogleAuthError, AdminError, safeEqual } from '@lingora/shared';
import { db, googleConfig, googleEnabled, redirectTo, clientIp, safeNext, CUST_COOKIE, custCookieOpts, limit } from '@/lib/server';
import { COOKIE, cookieOpts } from '@/lib/admin';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const u = new URL(req.url); const jar = await cookies();
  const raw = jar.get('lw_gstate')?.value;
  let st: { s: string; n: string; t: string; x: string } | null = null;
  try { st = raw ? JSON.parse(Buffer.from(raw, 'base64url').toString()) : null; } catch { st = null; }
  const fail = (to: string) => { const r = redirectTo(req, to); r.cookies.set('lw_gstate', '', { path: '/api/auth/google', maxAge: 0 }); return r; };
  if (!googleEnabled() || !st || !u.searchParams.get('code') || !safeEqual(u.searchParams.get('state') || '', st.s)) return fail(st?.t === 'admin' ? '/admin/login/?e=bad' : '/account/?e=google');
  try { await limit(req, 'google_cb', 20, 600); } catch { return fail(st.t === 'admin' ? '/admin/login/?e=locked' : '/account/?e=rate'); }
  try {
    const cfg = googleConfig();
    const idToken = await exchangeGoogleCode({ code: u.searchParams.get('code')!, clientId: cfg.clientId, clientSecret: cfg.clientSecret, redirectUri: cfg.redirectUri });
    const who = await verifyGoogleIdToken(idToken, { clientId: cfg.clientId, nonce: st.n });
    if (st.t === 'admin') {
      const ownerEmails = (process.env.OWNER_EMAILS || '').split(',').map(x => x.trim()).filter(Boolean);
      const { token } = await loginGoogle(db(), { email: who.email, ownerEmails, ip: clientIp(req), ua: req.headers.get('user-agent') });
      const res = redirectTo(req, '/admin/'); res.cookies.set(COOKIE, token, cookieOpts(8 * 3600)); res.cookies.set('lw_gstate', '', { path: '/api/auth/google', maxAge: 0 }); return res;
    }
    const c = await upsertCustomer(db(), { email: who.email, googleSub: who.sub, name: who.name });
    const token = await createCustomerSession(db(), { customerId: c.id, ip: clientIp(req), ua: req.headers.get('user-agent') });
    const res = redirectTo(req, safeNext(st.x)); res.cookies.set(CUST_COOKIE, token, custCookieOpts(30 * 86400)); res.cookies.set('lw_gstate', '', { path: '/api/auth/google', maxAge: 0 }); return res;
  } catch (e: any) {
    if (e instanceof AdminError) return fail('/admin/login/?e=' + (e.code === 'locked' ? 'locked' : 'denied'));
    if (!(e instanceof GoogleAuthError)) console.error('google callback', e);
    return fail(st.t === 'admin' ? '/admin/login/?e=bad' : '/account/?e=google');
  }
}
