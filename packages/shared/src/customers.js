// Customer accounts: e-mail magic links and Google sign-in end in the same session cookie.
// Guests can still buy with USDT without an account; accounts exist for the wallet (balance).
import { sha256Hex, randomToken } from './crypto.js';
import { renderEmail } from './email/templates.js';

export class CustomerError extends Error { constructor(code) { super(code); this.code = code; } }
export const normEmail = e => String(e || '').trim().toLowerCase();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const LOGIN_MIN = 15, SESSION_DAYS = 30;

export async function upsertCustomer(db, { email, googleSub = null, name = null }) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e) || e.length > 254) throw new CustomerError('invalid_email');
  const r = await db.query(
    `INSERT INTO customers (email, google_sub, display_name, last_login_at) VALUES ($1,$2,$3, now())
     ON CONFLICT (email) DO UPDATE SET google_sub = COALESCE(customers.google_sub, EXCLUDED.google_sub),
       display_name = COALESCE(customers.display_name, EXCLUDED.display_name), last_login_at = now() RETURNING *`, [e, googleSub, name]);
  return r.rows[0];
}
/** A customer row without marking a login (the owner credits a wallet before the customer ever signs in). */
export async function ensureCustomer(t, email) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e)) throw new CustomerError('invalid_email');
  const r = await t.query(`INSERT INTO customers (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING *`, [e]);
  return r.rows[0];
}

// ---------- magic link ----------
export async function createLoginToken(db, email) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e) || e.length > 254) throw new CustomerError('invalid_email');
  const token = randomToken(32);
  await db.query(`INSERT INTO login_tokens (token_hash, email, expires_at) VALUES ($1,$2, now() + ($3::int * interval '1 minute'))`, [sha256Hex(token), e, LOGIN_MIN]);
  return token;
}
/** Single use: the UPDATE only succeeds once. */
export async function consumeLoginToken(db, token) {
  const r = await db.query(`UPDATE login_tokens SET used_at = now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at > now() RETURNING email`, [sha256Hex(token || '')]);
  if (!r.rows[0]) throw new CustomerError('invalid_token');
  return r.rows[0].email;
}
/** Sends the sign-in link. Always resolves the same way so the form cannot be used to find out who has an account. */
export async function sendLoginLink(db, sender, { email, siteUrl, lang = 'en', nextPath = '/account/' }) {
  const token = await createLoginToken(db, email);
  const url = `${siteUrl}/api/auth/email/verify?t=${encodeURIComponent(token)}&next=${encodeURIComponent(nextPath)}`;
  const msg = renderEmail('login_link', lang, { loginUrl: url, supportEmail: process.env.SUPPORT_EMAIL || '' });
  await sender.send({ to: normEmail(email), subject: msg.subject, html: msg.html, text: msg.text });
}

// ---------- sessions ----------
export async function createCustomerSession(db, { customerId, ip = null, ua = null }) {
  const token = randomToken(32);
  await db.query(`INSERT INTO customer_sessions (token_hash, customer_id, expires_at, ip, ua) VALUES ($1,$2, now() + ($3::int * interval '1 day'), $4, $5)`,
    [sha256Hex(token), customerId, SESSION_DAYS, ip, String(ua || '').slice(0, 200)]);
  return token;
}
export async function getCustomerSession(db, token) {
  if (!token) return null;
  const r = (await db.query(`SELECT c.id, c.email, c.display_name FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=$1 AND s.expires_at > now()`, [sha256Hex(token)])).rows[0];
  return r ? { id: r.id, email: r.email, name: r.display_name } : null;
}
export const destroyCustomerSession = (db, token) => db.query('DELETE FROM customer_sessions WHERE token_hash=$1', [sha256Hex(token || '')]);
