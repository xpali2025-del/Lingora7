// Admin back-office core: users, sessions (password -> TOTP), roles, audited actions.
// UI layers (Next route handlers) only call these functions, so rules live in one tested place.
import { hashPassword, verifyPassword, encrypt, decrypt, sha256Hex, randomToken } from './crypto.js';
import { generateSecret, verifyTotp, otpauthUrl } from './totp.js';
import * as C from './commerce.js';
import * as W from './wallet.js';
import { parseAmount, formatAmount } from './money.js';

export class AdminError extends Error { constructor(code) { super(code); this.code = code; } }
export const ROLES = ['owner', 'support', 'editor', 'analyst'];
const SESSION_HOURS = 8, MAX_FAILS = 5, LOCK_MIN = 15;

/** Who may do what. analyst = read-only. */
export const ACTION_ROLES = {
  order_set_email: ['owner', 'support'], order_fulfil: ['owner', 'support'], order_resend: ['owner', 'support'],
  order_hold: ['owner', 'support'], order_release: ['owner', 'support'], order_accept_underpaid: ['owner'],
  refund_request: ['owner', 'support'], refund_decide: ['owner'],
  payment_match: ['owner', 'support'], payment_ignore: ['owner', 'support'],
  codes_import: ['owner', 'support'], code_void: ['owner'],
  provider_save: ['owner'], provider_toggle: ['owner'], provider_test: ['owner'],
  market_save: ['owner'], contact_save: ['owner'], setting_save: ['owner'], wallets_save: ['owner'],
  review_moderate: ['owner', 'support', 'editor'], template_save: ['owner', 'editor'], outbox_retry: ['owner', 'support'],
  user_create: ['owner'], user_create_google: ['owner'], topup_resolve: ['owner', 'support'], wallet_debit: ['owner'], wallet_credit: ['owner'], yemen_payments_save: ['owner'], user_disable: ['owner'], password_change: ['owner', 'support', 'editor', 'analyst'],
};
export const can = (role, action) => (ACTION_ROLES[action] || []).includes(role);

// ---------- users ----------
export async function createAdminUser(db, { email, password, role = 'owner', key32 }) {
  if (!ROLES.includes(role)) throw new AdminError('bad_role');
  if (String(password || '').length < 12) throw new AdminError('weak_password');
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !/^[a-z0-9._-]{3,32}$/.test(e)) throw new AdminError('bad_username');
  const secret = generateSecret();
  const r = await db.query(`INSERT INTO admin_users (email, password_hash, role, totp_secret_encrypted, totp_enabled) VALUES ($1,$2,$3,$4,TRUE) RETURNING id`,
    [e, await hashPassword(password), role, encrypt(secret, key32)]);
  return { id: r.rows[0].id, email: e, role, totpSecret: secret, otpauth: otpauthUrl(e, secret) };
}

// ---------- login: password, then TOTP ----------
export async function loginPassword(db, { email, password, ip = null, ua = null }) {
  const u = (await db.query('SELECT * FROM admin_users WHERE email=$1', [String(email || '').trim().toLowerCase()])).rows[0];
  if (!u) { await verifyPassword(password || '', 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='); throw new AdminError('invalid_credentials'); }
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw new AdminError('locked');
  if (!(await verifyPassword(password || '', u.password_hash))) {
    await db.query(`UPDATE admin_users SET failed_logins=failed_logins+1, locked_until=CASE WHEN failed_logins+1>=$2 THEN now()+($3::int*interval '1 minute') ELSE locked_until END WHERE id=$1`, [u.id, MAX_FAILS, LOCK_MIN]);
    await audit(db, { id: u.id, email: u.email }, 'login_failed', null, {}, ip);
    throw new AdminError('invalid_credentials');
  }
  const token = randomToken(32);
  await db.query(`INSERT INTO admin_sessions (token_hash,user_id,stage,expires_at,ip,ua) VALUES ($1,$2,'password_ok', now()+interval '10 minutes', $3, $4)`, [sha256Hex(token), u.id, ip, String(ua || '').slice(0, 200)]);
  return { token };
}
export async function loginTotp(db, { token, code, key32, ip = null }) {
  const s = (await db.query(`SELECT s.*, u.totp_secret_encrypted, u.email FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.stage='password_ok' AND s.expires_at>now()`, [sha256Hex(token || '')])).rows[0];
  if (!s) throw new AdminError('session_expired');
  await assertTotp(db, s.user_id, s.totp_secret_encrypted, code, key32, async () => {
    // A wrong code counts like a wrong password: lock the account and kill the half-open session at the limit.
    const u = (await db.query(`UPDATE admin_users SET failed_logins=failed_logins+1, locked_until=CASE WHEN failed_logins+1>=$2 THEN now()+($3::int*interval '1 minute') ELSE locked_until END WHERE id=$1 RETURNING failed_logins`, [s.user_id, MAX_FAILS, LOCK_MIN])).rows[0];
    if (u && u.failed_logins >= MAX_FAILS) await db.query(`DELETE FROM admin_sessions WHERE user_id=$1 AND stage='password_ok'`, [s.user_id]);
    await audit(db, { id: s.user_id, email: s.email }, 'totp_failed', null, {}, ip);
  });
  await db.query(`UPDATE admin_sessions SET stage='full', expires_at=now()+($2::int*interval '1 hour') WHERE token_hash=$1`, [s.token_hash, SESSION_HOURS]);
  await db.query('UPDATE admin_users SET failed_logins=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [s.user_id]);
  await audit(db, { id: s.user_id, email: s.email }, 'login', null, {}, ip);
}
/** A TOTP code is valid once: the last accepted time step per user is remembered. */
async function assertTotp(db, userId, secretEnc, code, key32, onFail) {
  const secret = decrypt(secretEnc, key32), c = String(code || '').replace(/\s/g, '');
  const ok = /^\d{6}$/.test(c) && verifyTotp(secret, c);
  const last = await C.getSetting(db, `totp_last:${userId}`, null);
  if (!ok || last === c + ':' + Math.floor(Date.now() / 30000)) { if (onFail) await onFail(); throw new AdminError('invalid_code'); }
  await C.setSetting(db, `totp_last:${userId}`, c + ':' + Math.floor(Date.now() / 30000));
}
/** Sign-in with a verified Google address. Allowed: an existing admin user, or an address listed in ownerEmails (bootstrap, no shell needed). */
export async function loginGoogle(db, { email, ownerEmails = [], ip = null, ua = null }) {
  const e = String(email || '').trim().toLowerCase();
  let u = e ? (await db.query('SELECT * FROM admin_users WHERE email=$1', [e])).rows[0] : null;
  if (!u && e && ownerEmails.map(x => String(x).trim().toLowerCase()).includes(e)) {
    await db.query(`INSERT INTO admin_users (email, password_hash, role, totp_enabled) VALUES ($1, NULL, 'owner', FALSE) ON CONFLICT (email) DO NOTHING`, [e]);
    u = (await db.query('SELECT * FROM admin_users WHERE email=$1', [e])).rows[0];
  }
  if (!u) { await audit(db, { email: e || null }, 'login_google_denied', null, {}, ip); throw new AdminError('not_allowed'); }
  if (u.locked_until && new Date(u.locked_until) > new Date()) throw new AdminError('locked');
  const token = randomToken(32);
  await db.query(`INSERT INTO admin_sessions (token_hash,user_id,stage,expires_at,ip,ua) VALUES ($1,$2,'full', now()+($3::int*interval '1 hour'), $4, $5)`, [sha256Hex(token), u.id, SESSION_HOURS, ip, String(ua || '').slice(0, 200)]);
  await db.query('UPDATE admin_users SET failed_logins=0, last_login_at=now() WHERE id=$1', [u.id]);
  await audit(db, { id: u.id, email: u.email }, 'login_google', null, {}, ip);
  return { token, role: u.role };
}
export async function getSession(db, token) {
  if (!token) return null;
  const r = (await db.query(`SELECT u.id, u.email, u.role, s.token_hash FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.stage='full' AND s.expires_at>now() AND (u.locked_until IS NULL OR u.locked_until<now())`, [sha256Hex(token)])).rows[0];
  return r || null;
}
export const logout = (db, token) => db.query('DELETE FROM admin_sessions WHERE token_hash=$1', [sha256Hex(token || '')]);
export const audit = (db, user, action, target = null, data = {}, ip = null) =>
  db.query('INSERT INTO audit_logs (user_id, actor, action, target, ip, data) VALUES ($1,$2,$3,$4,$5,$6)', [user?.id ?? null, user?.email ?? null, action, target, ip, JSON.stringify(redact(data))]);
const redact = d => JSON.parse(JSON.stringify(d || {}, (k, v) => /secret|password|apikey|totp|token/i.test(k) ? '[redacted]' : v));

// ---------- actions ----------
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const int = v => { const n = Number(v); if (!Number.isInteger(n) || n <= 0) throw new AdminError('bad_input'); return n; };
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);

/** Executes one audited admin action. Returns a short result message for the UI. */
export async function runAction(db, user, action, p, { key32, ip = null } = {}) {
  if (!user) throw new AdminError('unauthenticated');
  if (!can(user.role, action)) throw new AdminError('forbidden');
  const actor = user.email;
  const log = (target, data) => audit(db, user, action, target, data, ip);
  switch (action) {
    case 'order_set_email': await C.setOrderEmail(db, { orderId: int(p.orderId), email: str(p.email, 254), actor, key32 }); await log(`order:${p.orderId}`, {}); return 'email updated';
    case 'order_fulfil': { const r = await C.fulfilOrder(db, int(p.orderId), actor, p.codeId ? int(p.codeId) : null); await log(`order:${p.orderId}`, {}); return r?.ok === false ? 'no stock' : 'queued'; }
    case 'order_resend': await C.resendCode(db, { orderId: int(p.orderId), actor }); await log(`order:${p.orderId}`, {}); return 'resend queued';
    case 'order_hold': await C.holdOrder(db, { orderId: int(p.orderId), reason: str(p.reason) || 'manual', actor }); await log(`order:${p.orderId}`, {}); return 'held';
    case 'order_release': await C.releaseHold(db, { orderId: int(p.orderId), actor }); await log(`order:${p.orderId}`, {}); return 'released';
    case 'order_accept_underpaid': await C.acceptUnderpaid(db, { orderId: int(p.orderId), actor }); await log(`order:${p.orderId}`, {}); return 'shortfall accepted';
    case 'refund_request': await C.requestRefund(db, { orderId: int(p.orderId), actor, reason: str(p.reason) }); await log(`order:${p.orderId}`, { reason: str(p.reason) }); return 'refund requested';
    case 'refund_decide': await C.decideRefund(db, { orderId: int(p.orderId), approve: p.approve === '1' || p.approve === true, actor, voidCodeToo: p.voidCode === '1' }); await log(`order:${p.orderId}`, { approve: p.approve }); return 'decided';
    case 'payment_match': { const r = await C.matchPaymentToOrder(db, { paymentId: int(p.paymentId), orderId: int(p.orderId), actor }); await log(`payment:${p.paymentId}`, { orderId: p.orderId, ...r }); return r.outcome; }
    case 'payment_ignore': await C.setPaymentStatus(db, { paymentId: int(p.paymentId), status: p.status === 'refunded' ? 'refunded' : 'ignored', actor }); await log(`payment:${p.paymentId}`, { status: p.status }); return 'updated';
    case 'codes_import': { const r = await C.importCodes(db, { source: str(p.source, 80) || 'csv', notes: str(p.notes), text: String(p.text || '').slice(0, 2_000_000), actor, key32 }); await log(`batch:${r.batchId}`, r); return `added ${r.added}, duplicates ${r.duplicates}, rejected ${r.rejected}`; }
    case 'code_void': await C.voidCode(db, { codeId: int(p.codeId), actor }); await log(`code:${p.codeId}`, {}); return 'voided';
    case 'provider_save': return saveProvider(db, user, p, key32, log);
    case 'provider_toggle': {
      const row = (await db.query('SELECT * FROM payment_providers WHERE id=$1', [int(p.id)])).rows[0]; if (!row) throw new AdminError('not_found');
      const on = p.enabled === '1';
      if (on && row.type !== 'paypal' && row.type !== 'payoneer' && !row.public_config?.receivingAddress) throw new AdminError('provider_not_configured');
      if (on && (row.type === 'paypal' || row.type === 'payoneer')) throw new AdminError('adapter_not_available');
      await db.query('UPDATE payment_providers SET enabled=$2 WHERE id=$1', [row.id, on]); await log(`provider:${row.type}`, { enabled: on }); return on ? 'enabled' : 'disabled';
    }
    case 'provider_test': await db.query('UPDATE payment_providers SET test_requested_at=now() WHERE id=$1', [int(p.id)]); await log(`provider:${p.id}`, {}); return 'test requested (worker runs it within seconds)';
    case 'market_save': {
      const m = (await db.query('SELECT * FROM markets WHERE id=$1', [int(p.id)])).rows[0]; if (!m) throw new AdminError('not_found');
      const price = formatAmount(parseAmount(str(p.price, 20))); if (parseAmount(price) <= 0n) throw new AdminError('bad_input');
      const mode = ['manual', 'auto'].includes(p.fulfilmentMode) ? p.fulfilmentMode : null;
      await db.tx(async t => {
        await t.query('UPDATE markets SET price_usdt=$2, enabled=$3, status=$4, fulfilment_mode=$5 WHERE id=$1', [m.id, price, p.enabled === '1', p.status === 'live' ? 'live' : 'draft', mode]);
        if (parseAmount(price) !== parseAmount(m.price_usdt)) await t.query('INSERT INTO price_history (market_id, price_usdt, changed_by) VALUES ($1,$2,$3)', [m.id, price, actor]);
      });
      await log(`market:${m.code}`, { price, enabled: p.enabled, status: p.status, mode }); return 'saved (page copy must show the same price)';
    }
    case 'setting_save': {
      const allowed = { fulfilment_mode: v => (['manual', 'auto'].includes(v) ? v : null), order_expiry_minutes: v => (Number(v) >= 10 && Number(v) <= 240 ? Number(v) : null),
        low_stock_threshold: v => (Number(v) >= 0 ? Number(v) : null), review_invite_days: v => (Number(v) >= 0 && Number(v) <= 30 ? Number(v) : null), overpay_policy: v => (v === 'accept' ? v : null) };
      const f = allowed[p.key]; const val = f ? f(str(p.value, 20)) : null; if (val === null) throw new AdminError('bad_input');
      await C.setSetting(db, p.key, val); await log(`setting:${p.key}`, { value: val }); return 'saved';
    }
    case 'contact_save': {
      const out = {};
      const email = str(p.email, 120).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminError('bad_email');
      out.email = email;
      const wa = str(p.whatsapp, 30).replace(/[\s\-()+]/g, '');
      if (wa && !/^\d{7,15}$/.test(wa)) throw new AdminError('bad_whatsapp');
      out.whatsapp = wa;
      for (const k of ['facebook', 'instagram', 'x', 'tiktok', 'youtube', 'telegram', 'linkedin']) {
        const v = str(p[k], 200);
        if (v) { let u; try { u = new URL(v); } catch { throw new AdminError('bad_url_' + k); } if (u.protocol !== 'https:') throw new AdminError('bad_url_' + k); out[k] = u.toString(); } else out[k] = '';
      }
      for (const k of ['legal_name', 'hours_ar', 'hours_en', 'address_ar', 'address_en']) out[k] = str(p[k], 200);
      await C.setSetting(db, 'contact', out); await log('settings:contact', { fields: Object.keys(out).filter(k => out[k]) }); return 'saved';
    }
    case 'wallets_save': { const list = String(p.wallets || '').split(/[\s,]+/).filter(Boolean); if (list.some(w => !ADDR_RE.test(w))) throw new AdminError('bad_address'); await C.setSetting(db, 'flagged_wallets', list.map(w => w.toLowerCase())); await log('settings:flagged_wallets', { count: list.length }); return `saved ${list.length}`; }
    case 'review_moderate': await C.moderateReview(db, { reviewId: int(p.reviewId), action: str(p.op, 20), actor, reply: p.reply, redactedBody: p.body }); await log(`review:${p.reviewId}`, { op: p.op }); return 'done';
    case 'template_save': {
      const t = str(p.template, 40), l = str(p.lang, 5); if (!/^[a-z_]+$/.test(t) || !/^[a-z]{2}$/.test(l)) throw new AdminError('bad_input');
      const fields = {}; for (const k of ['subject', 'intro', 'linkLabel', 'stepsTitle', 'note', 'support', 'button', 'optout']) if (str(p[k], 2000)) fields[k] = str(p[k], 2000);
      await C.setSetting(db, `email_template:${t}:${l}`, Object.keys(fields).length ? fields : null); await log(`template:${t}:${l}`, {}); return 'saved';
    }
    case 'outbox_retry': await db.query(`UPDATE email_outbox SET status='pending', attempts=0, next_attempt_at=now() WHERE id=$1 AND status IN ('failed','cancelled')`, [int(p.id)]); await log(`outbox:${p.id}`, {}); return 'retry queued';
    case 'user_create': { const r = await createAdminUser(db, { email: p.email, password: p.password, role: p.role, key32 }); await log(`user:${r.email}`, { role: r.role }); return { message: 'user created', totpSecret: r.totpSecret, otpauth: r.otpauth }; }
    case 'user_create_google': {
      const e = str(p.email, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new AdminError('bad_username');
      if (!ROLES.includes(p.role)) throw new AdminError('bad_role');
      const r = await db.query(`INSERT INTO admin_users (email, password_hash, role, totp_enabled) VALUES ($1, NULL, $2, FALSE) ON CONFLICT (email) DO NOTHING RETURNING id`, [e, p.role]);
      if (!r.rows[0]) throw new AdminError('user_exists');
      await log(`user:${e}`, { role: p.role, google: true }); return 'Google user added: they sign in with "Continue with Google"';
    }
    case 'topup_resolve': { const r = await W.resolveTopup(db, { id: int(p.id), action: p.op === 'reject' ? 'reject' : 'credit', amount: p.amount, actor, note: str(p.note) }); await log(`topup:${p.id}`, { op: p.op, amount: p.amount, ...r }); return r.status === 'credited' ? `credited, balance ${r.balance}` : 'rejected'; }
    case 'wallet_credit': { const r = await W.creditWallet(db, { email: str(p.email, 254), amount: p.amount, note: str(p.note) || 'manual credit', actor, kind: 'adjustment' }); await log(`wallet:${p.email}`, { amount: p.amount }); return `credited, balance ${r.balance}`; }
    case 'wallet_debit': { const r = await W.debitWallet(db, { email: str(p.email, 254), amount: p.amount, note: str(p.note) || 'manual debit', actor }); await log(`wallet:${p.email}`, { amount: p.amount, debit: true }); return `debited, balance ${r.balance}`; }
    case 'yemen_payments_save': {
      const blocks = String(p.text || '').replace(/\r/g, '').split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length)
        .map(b => ({ title: b[0].slice(0, 80), lines: b.slice(1, 12).map(l => l.slice(0, 160)) })).slice(0, 12);
      await C.setSetting(db, 'ye_payment_methods', blocks); await log('settings:ye_payment_methods', { blocks: blocks.length }); return `saved ${blocks.length} block(s)`;
    }
    case 'user_disable': { if (int(p.id) === user.id) throw new AdminError('cannot_disable_self'); await db.query(`UPDATE admin_users SET locked_until='2999-01-01' WHERE id=$1`, [int(p.id)]); await db.query('DELETE FROM admin_sessions WHERE user_id=$1', [int(p.id)]); await log(`user:${p.id}`, {}); return 'disabled'; }
    case 'password_change': {
      const u = (await db.query('SELECT * FROM admin_users WHERE id=$1', [user.id])).rows[0];
      if (!(await verifyPassword(p.current || '', u.password_hash))) throw new AdminError('invalid_credentials');
      if (String(p.next || '').length < 12) throw new AdminError('weak_password');
      await db.query('UPDATE admin_users SET password_hash=$2 WHERE id=$1', [u.id, await hashPassword(p.next)]);
      await db.query('DELETE FROM admin_sessions WHERE user_id=$1 AND token_hash<>$2', [u.id, user.token_hash]); await log(`user:${u.id}`, {}); return 'password changed';
    }
    default: throw new AdminError('unknown_action');
  }
}

async function saveProvider(db, user, p, key32, log) {
  const row = (await db.query('SELECT * FROM payment_providers WHERE id=$1', [int(p.id)])).rows[0]; if (!row) throw new AdminError('not_found');
  if (!['binance_bep20', 'mock'].includes(row.type)) throw new AdminError('adapter_not_available');
  const pub = { ...(row.public_config || {}) };
  const addr = str(p.receivingAddress, 60);
  if (addr) {
    if (!ADDR_RE.test(addr)) throw new AdminError('bad_address');
    if (pub.receivingAddress && pub.receivingAddress.toLowerCase() !== addr.toLowerCase()) {   // changing the wallet = re-confirm with a fresh 2FA code
      const u = (await db.query('SELECT totp_secret_encrypted FROM admin_users WHERE id=$1', [user.id])).rows[0];
      if (u.totp_secret_encrypted) await assertTotp(db, user.id, u.totp_secret_encrypted, p.totp, key32, null).catch(() => { throw new AdminError('totp_required'); });
      else {   // Google-only admin: no authenticator, so the session itself must be fresh (signed in within the last 15 minutes)
        const fresh = (await db.query(`SELECT 1 FROM admin_sessions WHERE token_hash=$1 AND created_at > now() - interval '15 minutes'`, [user.token_hash])).rows[0];
        if (!fresh) throw new AdminError('recent_login_required');
      }
    }
    pub.receivingAddress = addr;
  }
  if (row.type === 'binance_bep20') {
    pub.strategy = p.strategy === 'onchain' ? 'onchain' : 'binance';
    if (p.rpcUrl !== undefined && str(p.rpcUrl)) { if (!/^https:\/\//.test(str(p.rpcUrl))) throw new AdminError('bad_input'); pub.rpcUrl = str(p.rpcUrl); }
    if (p.verifyRpcUrl !== undefined) { const v = str(p.verifyRpcUrl); if (v) { if (!/^https:\/\//.test(v)) throw new AdminError('bad_input'); pub.verifyRpcUrl = v; } else delete pub.verifyRpcUrl; }
    if (str(p.usdtContract)) { if (!ADDR_RE.test(str(p.usdtContract))) throw new AdminError('bad_address'); pub.usdtContract = str(p.usdtContract); }
    if (str(p.requiredConfirmations)) pub.requiredConfirmations = int(p.requiredConfirmations);
  }
  pub.network = 'BSC'; pub.asset = 'USDT';
  let enc = row.config_encrypted;
  if (str(p.apiKey) || str(p.apiSecret)) {            // secrets are write-only: stored encrypted, never displayed
    const cur = enc ? JSON.parse(decrypt(enc, key32)) : {};
    if (str(p.apiKey, 300)) cur.apiKey = str(p.apiKey, 300);
    if (str(p.apiSecret, 300)) cur.apiSecret = str(p.apiSecret, 300);
    enc = encrypt(JSON.stringify(cur), key32);
  }
  await db.query(`UPDATE payment_providers SET public_config=$2, config_encrypted=$3, last_test_ok=NULL, last_test_message=NULL WHERE id=$1`, [row.id, JSON.stringify(pub), enc]);
  await log(`provider:${row.type}`, { addressChanged: !!addr, secretsUpdated: !!(str(p.apiKey) || str(p.apiSecret)), strategy: pub.strategy });
  return 'saved - run "Test connection" before enabling';
}
