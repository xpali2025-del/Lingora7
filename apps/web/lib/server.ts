import { NextResponse } from 'next/server';
import { getDb, loadKey, hmacSha256Hex, CommerceError, rateLimit, extractClientIp, isKnownIp, isSameOrigin, publicUrl } from '@lingora/shared';

export const db = () => getDb();
export const key32 = () => loadKey();
export const clientIp = (req: Request): string => extractClientIp((k: string) => req.headers.get(k));
export const SITE = () => (process.env.SITE_URL || 'https://lingora.world').replace(/\/$/, '');
export const originOk = (req: Request) => isSameOrigin(req.headers.get('origin'), { siteUrl: SITE(), hostHeader: req.headers.get('host') || undefined });
/** Redirect on the PUBLIC origin (303 so a POST becomes a GET). */
export const redirectTo = (req: Request, path: string) => NextResponse.redirect(publicUrl(path, { siteUrl: SITE(), requestUrl: req.url }), 303);
export const ipHash = (req: Request) => hmacSha256Hex(key32(), 'ip:' + clientIp(req)).slice(0, 32);

const STATUS: Record<string, number> = { not_found: 404, invalid_token: 404, market_unavailable: 400, no_payment_method: 503,
  provider_not_configured: 503, busy: 503, too_many_open_orders: 429, rate_limited: 429, client_ip_unavailable: 400, captcha_failed: 400 };
export function fail(e0: unknown) {
  const e = e0 as any;
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
