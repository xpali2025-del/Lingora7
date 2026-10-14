// Proxy-aware request helpers (pure functions, unit-tested).
// NODE_ENV is read through process.env.NODE_ENV literally so the Next bundler inlines it (it is not reliably present at runtime otherwise).
const nodeEnv = env => (env === process.env ? process.env.NODE_ENV : env.NODE_ENV);

/**
 * Real client IP, never trusting client-supplied headers blindly.
 *  - CLIENT_IP_HEADER (e.g. "cf-connecting-ip") if the edge sets it (strip it at your proxy if it does not).
 *  - Otherwise X-Forwarded-For, taking the entry added by the Nth trusted proxy from the RIGHT
 *    (TRUSTED_PROXY_HOPS, default 1). Anything the client prepended is ignored.
 * Returns 'unknown' when no trustworthy value exists; callers must fail closed in production.
 */
export function extractClientIp(get, env = process.env) {
  const h = String(env.CLIENT_IP_HEADER || '').toLowerCase();
  if (h) { const v = (get(h) || '').trim(); return v || 'unknown'; }
  const hops = Number(env.TRUSTED_PROXY_HOPS ?? 1);
  const parts = (get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (hops > 0 && parts.length >= hops) return parts[parts.length - hops];
  if (nodeEnv(env) !== 'production') return '127.0.0.1';   // local dev without a proxy
  return 'unknown';
}
export const isKnownIp = ip => ip && ip !== 'unknown';

/** CSRF origin check against the PUBLIC site host (works behind proxies that rewrite Host). */
export function isSameOrigin(origin, { siteUrl, hostHeader, env = process.env } = {}) {
  if (!origin) return false;
  let o; try { o = new URL(origin); } catch { return false; }
  const allowed = new Set();
  try { allowed.add(new URL(siteUrl).host); } catch { /* none */ }
  if (nodeEnv(env) !== 'production' && hostHeader) allowed.add(hostHeader);
  return allowed.has(o.host);
}
/** Absolute URL on the public origin (not the proxy-internal one). */
export const publicUrl = (path, { siteUrl, requestUrl, env = process.env } = {}) =>
  new URL(path, nodeEnv(env) === 'production' ? siteUrl : (requestUrl || siteUrl));
