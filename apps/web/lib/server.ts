import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb, loadKey, getCustomerSession, hmacSha256Hex, CommerceError, CustomerError, rateLimit, extractClientIp, isKnownIp, isSameOrigin, publicUrl } from '@lingora/shared';

export const db = () => getDb();
export const key32 = () => loadKey();
export const clientIp = (req: Request): string => extractClientIp((k: string) => req.headers.get(k));
export const SITE = () => (process.env.SITE_URL || 'https://lingora.world').replace(/\/$/, '');
export const originOk = (req: Request) => isSameOrigin(req.headers.get('origin'), { siteUrl: SITE(), hostHeader: req.headers.get('host') || undefined });
/** Redirect on the PUBLIC origin (303 so a POST becomes a GET). */
export const redirectTo = (req: Request, path: string) => NextResponse.redirect(publicUrl(path, { siteUrl: SITE(), requestUrl: req.url }), 303);
export const ipHash = (req: Request) => hmacSha256Hex(key32(), 'ip:' + clientIp(req)).slice(0, 32);

// ---------- customer session (cookie lw_cust). Lax, not Strict: the return trip from Google is a cross-site navigation. ----------
export const CUST_COOKIE = 'lw_cust';
export const secureCookies = () => process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1';
export const custCookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: 'lax' as const, secure: secureCookies(), path: '/', maxAge });
export async function currentCustomer() {
  const token = (await cookies()).get(CUST_COOKIE)?.value;
  return getCustomerSession(db(), token || '');
}
export const googleConfig = () => ({ clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '', redirectUri: SITE() + '/api/auth/google/callback' });
export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
/** Only same-site relative paths may be used as a post-login destination. */
export const safeNext = (n: unknown, fallback = '/account/') => (typeof n === 'string' && /^\/[a-z0-9\-_/]*$/i.test(n) && !n.startsWith('//') ? n : fallback);

const STATUS: Record<string, number> = { not_found: 404, invalid_token: 404, market_unavailable: 400, no_payment_method: 503,
  provider_not_configured: 503, busy: 503, too_many_open_orders: 429, rate_limited: 429, client_ip_unavailable: 400, captcha_failed: 400,
  out_of_stock: 409, insufficient_balance: 402, invalid_amount: 400, invalid_request: 400, invalid_email: 400, too_many_open_requests: 429 };
export function fail(e0: unknown) {
  const e = e0 as any;
  if (e instanceof CustomerError) return NextResponse.json({ error: e.code }, { status: e.code === 'invalid_token' ? 404 : 400 });
  if (e instanceof CommerceError) return NextResponse.json({ error: e.code }, { status: STATUS[e.code] ?? 400 });
  console.error('api error', e);
  return NextResponse.json({ error: 'server_error' }, { status: 500 });
}
export async function limit(req: Request, name: string, max: number, windowSec: number) {
  if (!isKnownIp(clientIp(req))) throw new CommerceError('client_ip_unavailable');   // fail closed: never share one bucket
  if (!(await rateLimit(db(), `${name}:${ipHash(req)}`, max, windowSec))) throw new CommerceError('rate_limited');
}
/** Cloudflare Turnstile: enforced only when TURNSTILE_SECRET_KEY is set. */
export async function verifyCaptcha(req: Request, token: unknown) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return;
  if (typeof token !== 'string' || !token) throw new CommerceError('captcha_failed');
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret, response: token, remoteip: clientIp(req) }) });
  const j = await r.json().catch(() => ({}));
  if (!j.success) throw new CommerceError('captcha_failed');
}
export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  try { const b = await req.json(); return b && typeof b === 'object' ? b : {}; } catch { return {}; }
}
