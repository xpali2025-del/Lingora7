// Sign in with Google (OpenID Connect, authorization-code flow) without any SDK.
// The id_token is verified here (signature against Google's published keys, issuer, audience, expiry, nonce, verified e-mail).
import { createPublicKey, createVerify } from 'node:crypto';

export class GoogleAuthError extends Error { constructor(code) { super(code); this.code = code; } }
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

export function googleAuthUrl({ clientId, redirectUri, state, nonce }) {
  const u = new URL(AUTH_URL);
  u.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, prompt: 'select_account' }).toString();
  return u.toString();
}
export async function exchangeGoogleCode({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  const r = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id_token) throw new GoogleAuthError('google_exchange_failed');
  return j.id_token;
}
let certCache = { at: 0, keys: null };
async function googleKeys(fetchImpl, now) {
  if (certCache.keys && now - certCache.at < 3600e3) return certCache.keys;
  const r = await fetchImpl(CERTS_URL); const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.keys)) throw new GoogleAuthError('google_keys_unavailable');
  certCache = { at: now, keys: j.keys }; return j.keys;
}
const b64u = s => Buffer.from(s, 'base64url');
/** Returns { sub, email, name }. Throws GoogleAuthError for any problem; callers never see unverified claims. */
export async function verifyGoogleIdToken(idToken, { clientId, nonce, fetchImpl = fetch, now = Date.now(), keys = null } = {}) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new GoogleAuthError('bad_id_token');
  let header, claims;
  try { header = JSON.parse(b64u(parts[0]).toString()); claims = JSON.parse(b64u(parts[1]).toString()); } catch { throw new GoogleAuthError('bad_id_token'); }
  if (header.alg !== 'RS256') throw new GoogleAuthError('bad_id_token');
  const jwk = (keys || await googleKeys(fetchImpl, now)).find(k => k.kid === header.kid);
  if (!jwk) throw new GoogleAuthError('unknown_signing_key');
  const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), b64u(parts[2]));
  if (!ok) throw new GoogleAuthError('bad_signature');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss)) throw new GoogleAuthError('bad_issuer');
  if (claims.aud !== clientId) throw new GoogleAuthError('bad_audience');
  if (!(Number(claims.exp) * 1000 > now)) throw new GoogleAuthError('token_expired');
  if (nonce !== undefined && claims.nonce !== nonce) throw new GoogleAuthError('bad_nonce');
  if (claims.email_verified !== true || !claims.email || !claims.sub) throw new GoogleAuthError('email_not_verified');
  return { sub: String(claims.sub), email: String(claims.email).trim().toLowerCase(), name: claims.name ? String(claims.name).slice(0, 80) : null };
}
