import { NextResponse } from 'next/server';
import { randomToken, googleAuthUrl } from '@lingora/shared';
import { googleConfig, googleEnabled, safeNext, secureCookies, redirectTo } from '@/lib/server';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!googleEnabled()) return redirectTo(req, '/account/?e=google_off');
  const u = new URL(req.url); const type = u.searchParams.get('type') === 'admin' ? 'admin' : 'customer';
  const state = randomToken(18), nonce = randomToken(18);
  const next = type === 'admin' ? '/admin/' : safeNext(u.searchParams.get('next'));
  const res = NextResponse.redirect(googleAuthUrl({ clientId: googleConfig().clientId, redirectUri: googleConfig().redirectUri, state, nonce }), 303);
  // The cookie binds this browser to this sign-in attempt (CSRF/login-fixation protection); it holds nothing secret.
  res.cookies.set('lw_gstate', Buffer.from(JSON.stringify({ s: state, n: nonce, t: type, x: next })).toString('base64url'), { httpOnly: true, sameSite: 'lax', secure: secureCookies(), path: '/api/auth/google', maxAge: 600 });
  return res;
}
