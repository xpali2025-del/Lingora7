// Commerce core: orders, payment matching, code allocation, email outbox, reviews.
// Every function takes a db adapter (see db.js). State changes happen inside transactions and are idempotent.
import { encrypt, decrypt, sha256Hex, randomToken, safeEqual, hmacSha256Hex, loadKey } from './crypto.js';
import { parseAmount, formatAmount, withOffset, cmpAmounts } from './money.js';

export class CommerceError extends Error {
  constructor(code, message) { super(message || code); this.code = code; }
}

// ---------- order state machine (plan section 4) ----------
export const TRANSITIONS = {
  created: ['awaiting_payment', 'failed'],
  awaiting_payment: ['paid_unconfirmed', 'paid', 'expired', 'failed'],
  paid_unconfirmed: ['paid', 'underpaid', 'overpaid', 'failed'],
  paid: ['awaiting_email', 'failed'],
  awaiting_email: ['ready_to_fulfil', 'failed'],
  ready_to_fulfil: ['fulfilled', 'failed'],
  fulfilled: ['refund_requested', 'failed'],
  expired: ['paid', 'underpaid', 'failed'],             // only via admin matching of a late payment
  underpaid: ['paid', 'refund_requested', 'failed'],
  overpaid: ['paid', 'refund_requested', 'failed'],
  refund_requested: ['refunded', 'rejected', 'failed'],
  refunded: [], rejected: [], failed: [],
};
export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

export async function addEvent(t, orderId, type, data = {}, actor = 'system') {
  await t.query('INSERT INTO order_events (order_id, type, data, actor) VALUES ($1,$2,$3,$4)', [orderId, type, JSON.stringify(data), actor]);
}
/** Compare-and-set transition; returns the updated row or null if the order was not in `from`. */
export async function transition(t, orderId, from, to, data = {}, actor = 'system', extraSet = '', extraParams = []) {
  if (!canTransition(from, to)) throw new CommerceError('bad_transition', `${from} -> ${to}`);
  const r = await t.query(
    `UPDATE orders SET status=$3${extraSet ? ', ' + extraSet : ''} WHERE id=$1 AND status=$2 RETURNING *`,
    [orderId, from, to, ...extraParams]);
  if (!r.rows[0]) return null;
  await addEvent(t, orderId, `status:${to}`, { from, ...data }, actor);
  return r.rows[0];
}
export async function getSetting(q, key, fallback = null) {
  const r = await q.query('SELECT value FROM settings WHERE key=$1', [key]);
  return r.rows[0] ? r.rows[0].value : fallback;
}
export async function setSetting(q, key, value) {
  await q.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, JSON.stringify(value)]);
}

// ---------- rate limiting (DB-backed, works across serverless instances) ----------
export async function rateLimit(db, key, limit, windowSec) {
  const r = await db.query(
    `INSERT INTO rate_limits (key,count,window_start) VALUES ($1,1,now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - ($2::int * interval '1 second') THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - ($2::int * interval '1 second') THEN now() ELSE rate_limits.window_start END
     RETURNING count`, [key, windowSec]);
  return Number(r.rows[0].count) <= limit;
}

// ---------- orders ----------
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O/1/I/L
const newRef = () => 'LG-' + Array.from({ length: 8 }, () => REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)]).join('');
const isUniqueViolation = e => e && (e.code === '23505' || /duplicate key|unique constraint/i.test(e.message || ''));
const MAX_OPEN_PER_IP = 5;

export async function pickProvider(q, marketId) {
  const r = await q.query(
    `SELECT p.* FROM payment_providers p JOIN market_payment_methods mpm ON mpm.provider_id=p.id
     WHERE mpm.market_id=$1 AND mpm.enabled AND p.enabled AND p.type IN ('binance_bep20','mock')
     ORDER BY mpm.sort, p.id LIMIT 1`, [marketId]);
  return r.rows[0] || null;
}

/** Creates an order. The price ALWAYS comes from the database (never from the client). */
export async function createOrder(db, { marketCode, ipHash = null }) {
  const m = (await db.query(`SELECT * FROM markets WHERE code=$1 AND enabled AND status='live'`, [marketCode])).rows[0];
  if (!m) throw new CommerceError('market_unavailable');
  const provider = await pickProvider(db, m.id);
  if (!provider) throw new CommerceError('no_payment_method');
  const cfg = provider.public_config || {};
  if (!cfg.receivingAddress) throw new CommerceError('provider_not_configured');

  if (ipHash) {
    const open = await db.query(`SELECT count(*)::int AS n FROM orders WHERE status='awaiting_payment' AND flags->>'ipHash'=$1`, [ipHash]);
    if (open.rows[0].n >= MAX_OPEN_PER_IP) throw new CommerceError('too_many_open_orders');
  }
  const expiryMin = Number(cfg.orderExpiryMinutes ?? (await getSetting(db, 'order_expiry_minutes', 30)));
  const [lo, hi] = Array.isArray(cfg.uniqueDecimalRange) ? cfg.uniqueDecimalRange
    : [await getSetting(db, 'unique_decimal_min', '0.0001'), await getSetting(db, 'unique_decimal_max', '0.0099')];
  const minUnits = Number(parseAmount(lo) / 10n ** 14n), maxUnits = Number(parseAmount(hi) / 10n ** 14n);   // multiples of 0.0001
  const basePrice = formatAmount(parseAmount(m.price_usdt));
  const key = randomToken(24);

  for (let attempt = 0; attempt < 25; attempt++) {
    const used = new Set((await db.query(`SELECT unique_amount FROM orders WHERE status='awaiting_payment' AND provider_id=$1`, [provider.id]))
      .rows.map(r => formatAmount(parseAmount(r.unique_amount))));
    const free = [];
    for (let u = minUnits; u <= maxUnits; u++) if (!used.has(withOffset(basePrice, u))) free.push(u);
    if (!free.length) throw new CommerceError('busy', 'no free unique amounts; try again shortly');
    const amount = withOffset(basePrice, free[Math.floor(Math.random() * free.length)]);
    const ref = newRef();
    try {
      const order = await db.tx(async t => {
        const o = (await t.query(
          `INSERT INTO orders (public_ref,key_hash,market_id,provider_id,price_usdt,unique_amount,status,expires_at,flags)
           VALUES ($1,$2,$3,$4,$5,$6,'awaiting_payment', now() + ($7::int * interval '1 minute'), $8) RETURNING *`,
          [ref, sha256Hex(key), m.id, provider.id, basePrice, amount, expiryMin, JSON.stringify(ipHash ? { ipHash } : {})])).rows[0];
        await addEvent(t, o.id, 'created', { market: m.code, amount, provider: provider.type });
        return o;
      });
      return { ref: order.public_ref, key, amount, address: cfg.receivingAddress, network: cfg.network || 'BSC',
               asset: cfg.asset || 'USDT', expiresAt: order.expires_at, priceUsdt: basePrice, market: m.code, provider: provider.type };
    } catch (e) { if (!isUniqueViolation(e)) throw e; }   // lost a race for this amount/ref: pick again
  }
  throw new CommerceError('busy');
}

export async function getOrderByRefKey(q, ref, key) {
  const o = (await q.query('SELECT o.*, m.code AS market_code, m.locale AS market_locale, m.language AS market_language FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.public_ref=$1', [ref])).rows[0];
  if (!o || !safeEqual(sha256Hex(key || ''), o.key_hash)) return null;
  return o;
}
/** Public view for the order page: never includes the email or the code. */
export async function getOrderForClient(db, ref, key) {
  const o = await getOrderByRefKey(db, ref, key);
  if (!o) return null;
  const cfg = (await db.query('SELECT public_config FROM payment_providers WHERE id=$1', [o.provider_id])).rows[0]?.public_config || {};
  return { ref: o.public_ref, status: o.status, amount: formatAmount(parseAmount(o.unique_amount)), address: cfg.receivingAddress || null,
           network: cfg.network || 'BSC', asset: cfg.asset || 'USDT', expiresAt: o.expires_at, market: o.market_code,
           emailSubmitted: !!o.email_submitted_at, delivered: o.status === 'fulfilled' };
}

// ---------- payment matching (idempotent) ----------
/**
 * ev: { txRef, amount, asset, network, confirmations, detectedAt, raw }
 * opts: { providerId, requiredConfirmations, expectedAsset, expectedNetwork }
 * Returns { result: 'duplicate'|'matched'|'confirmed'|'unmatched'|'ignored', orderId? }
 */
export async function recordPayment(db, ev, opts) {
  const { providerId, requiredConfirmations = 0, expectedAsset = 'USDT', expectedNetwork = 'BSC' } = opts;
  const amount = formatAmount(parseAmount(ev.amount));
  return db.tx(async t => {
    const existing = (await t.query('SELECT * FROM payments WHERE tx_hash=$1 FOR UPDATE', [ev.txRef])).rows[0];
    if (existing) {
      if ((ev.confirmations ?? 0) > existing.confirmations)
        await t.query('UPDATE payments SET confirmations=$2 WHERE id=$1', [existing.id, ev.confirmations]);
      if (existing.order_id && existing.status === 'matched' && (ev.confirmations ?? 0) >= requiredConfirmations) {
        const done = await confirmOrderPayment(t, existing.order_id, 'confirmations');
        if (done) return { result: 'confirmed', orderId: existing.order_id };
      }
      return { result: 'duplicate', orderId: existing.order_id };
    }
    const detectedAt = ev.detectedAt ? new Date(ev.detectedAt).toISOString() : new Date().toISOString();
    if (String(ev.asset).toUpperCase() !== expectedAsset || String(ev.network).toUpperCase() !== expectedNetwork) {
      await t.query(`INSERT INTO payments (provider_id,tx_hash,amount,asset,network,confirmations,status,detected_at,raw)
                     VALUES ($1,$2,$3,$4,$5,$6,'ignored',$7,$8) ON CONFLICT (tx_hash) DO NOTHING`,
        [providerId, ev.txRef, amount, ev.asset, ev.network, ev.confirmations ?? 0, detectedAt, JSON.stringify({ ...(ev.raw || {}), reason: 'wrong asset or network' })]);
      return { result: 'ignored' };
    }
    // Exact unique-amount match inside the order window; lock the order row so two payments cannot take it.
    const order = (await t.query(
      `SELECT * FROM orders WHERE provider_id=$1 AND unique_amount=$2 AND status='awaiting_payment'
         AND created_at <= $3::timestamptz AND expires_at >= $3::timestamptz FOR UPDATE`, [providerId, amount, detectedAt])).rows[0];
    if (!order) {
      const late = (await t.query(
        `SELECT id FROM orders WHERE provider_id=$1 AND unique_amount=$2 AND status='expired' ORDER BY id DESC LIMIT 1`, [providerId, amount])).rows[0];
      const ins = await t.query(`INSERT INTO payments (provider_id,tx_hash,amount,asset,network,confirmations,status,detected_at,raw)
        VALUES ($1,$2,$3,$4,$5,$6,'unmatched',$7,$8) ON CONFLICT (tx_hash) DO NOTHING RETURNING id`,
        [providerId, ev.txRef, amount, ev.asset, ev.network, ev.confirmations ?? 0, detectedAt, JSON.stringify({ ...(ev.raw || {}), lateForOrderId: late?.id ?? null })]);
      if (late && ins.rows[0]) await addEvent(t, late.id, 'late_payment', { txRef: ev.txRef, amount });
      return { result: 'unmatched' };
    }
    await t.query(`INSERT INTO payments (order_id,provider_id,tx_hash,amount,asset,network,confirmations,status,detected_at,raw)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'matched',$8,$9)`,
      [order.id, providerId, ev.txRef, amount, ev.asset, ev.network, ev.confirmations ?? 0, detectedAt, JSON.stringify(ev.raw || {})]);
    await transition(t, order.id, 'awaiting_payment', 'paid_unconfirmed', { txRef: ev.txRef, amount, confirmations: ev.confirmations ?? 0 }, 'worker', 'tx_ref=$4, paid_at=now()', [ev.txRef]);
    if ((ev.confirmations ?? 0) >= requiredConfirmations) await confirmOrderPayment(t, order.id, 'confirmations');
    return { result: 'matched', orderId: order.id };
  });
}
/** paid_unconfirmed -> paid -> awaiting_email. */
export async function confirmOrderPayment(t, orderId, reason = 'confirmed', actor = 'worker') {
  const paid = await transition(t, orderId, 'paid_unconfirmed', 'paid', { reason }, actor);
  if (!paid) return null;
  return transition(t, orderId, 'paid', 'awaiting_email', {}, actor);
}

export async function expireOrders(db) {
  const r = await db.query(`UPDATE orders SET status='expired' WHERE status='awaiting_payment' AND expires_at < now() RETURNING id`);
  for (const row of r.rows) await addEvent(db, row.id, 'status:expired', { from: 'awaiting_payment' });
  return r.rows.length;
}

// ---------- admin resolution of unmatched / underpaid / overpaid payments ----------
export async function matchPaymentToOrder(db, { paymentId, orderId, actor }) {
  return db.tx(async t => {
    const p = (await t.query('SELECT * FROM payments WHERE id=$1 FOR UPDATE', [paymentId])).rows[0];
    const o = (await t.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!p || !o) throw new CommerceError('not_found');
    if (p.status !== 'unmatched') throw new CommerceError('payment_not_unmatched');
    if (!['expired', 'awaiting_payment', 'underpaid'].includes(o.status)) throw new CommerceError('order_not_matchable');
    const cmp = cmpAmounts(p.amount, o.unique_amount);
    await t.query('UPDATE payments SET order_id=$2, resolved_by=$3, resolved_at=now(), status=$4 WHERE id=$1',
      [paymentId, orderId, actor, cmp < 0 ? 'underpaid' : cmp > 0 ? 'overpaid' : 'matched']);
    const from = o.status;
    if (cmp < 0) {
      if (from === 'underpaid') { await addEvent(t, orderId, 'extra_payment_below_expected', { paymentId }, actor); return { outcome: 'underpaid' }; }
      if (from === 'awaiting_payment') {  // legal path: pay a partial first
        await transition(t, orderId, 'awaiting_payment', 'paid_unconfirmed', { paymentId }, actor);
        await transition(t, orderId, 'paid_unconfirmed', 'underpaid', { paymentId, paid: p.amount, expected: o.unique_amount }, actor);
      } else await transition(t, orderId, from, 'underpaid', { paymentId, paid: p.amount, expected: o.unique_amount }, actor);
      return { outcome: 'underpaid' };
    }
    const flags = cmp > 0 ? { ...o.flags, overpaid: formatAmount(parseAmount(p.amount) - parseAmount(o.unique_amount)) } : o.flags;
    if (from === 'awaiting_payment') {
      await transition(t, orderId, 'awaiting_payment', 'paid_unconfirmed', { paymentId }, actor, 'tx_ref=$4, paid_at=now()', [p.tx_hash]);
      await confirmOrderPayment(t, orderId, 'admin_match', actor);
    } else {
      await transition(t, orderId, from, 'paid', { paymentId, via: 'admin_match' }, actor, 'tx_ref=$4, paid_at=now()', [p.tx_hash]);
      await transition(t, orderId, 'paid', 'awaiting_email', {}, actor);
    }
    await t.query('UPDATE orders SET flags=$2 WHERE id=$1', [orderId, JSON.stringify(flags)]);
    return { outcome: cmp > 0 ? 'overpaid_accepted' : 'matched' };
  });
}
/** Owner accepts a shortfall: underpaid -> paid -> awaiting_email. */
export async function acceptUnderpaid(db, { orderId, actor }) {
  return db.tx(async t => {
    const ok = await transition(t, orderId, 'underpaid', 'paid', { via: 'accepted_shortfall' }, actor);
    if (!ok) throw new CommerceError('not_underpaid');
    await transition(t, orderId, 'paid', 'awaiting_email', {}, actor);
    return true;
  });
}
export async function setPaymentStatus(db, { paymentId, status, actor }) {
  if (!['ignored', 'refunded'].includes(status)) throw new CommerceError('bad_status');
  const r = await db.query(`UPDATE payments SET status=$2, resolved_by=$3, resolved_at=now() WHERE id=$1 AND status='unmatched' RETURNING id`, [paymentId, status, actor]);
  if (!r.rows[0]) throw new CommerceError('payment_not_unmatched');
}

// ---------- email entry + fulfilment ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export async function submitEmail(db, { ref, key, email, emailConfirm, key32 }) {
  const e1 = String(email || '').trim().toLowerCase(), e2 = String(emailConfirm || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e1) || e1.length > 254) throw new CommerceError('invalid_email');
  if (e1 !== e2) throw new CommerceError('email_mismatch');
  const o0 = await getOrderByRefKey(db, ref, key);
  if (!o0) throw new CommerceError('not_found');
  return db.tx(async t => {
    const o = (await t.query('SELECT o.*, m.fulfilment_mode AS market_mode FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.id=$1 FOR UPDATE', [o0.id])).rows[0];
    if (o.status !== 'awaiting_email') {
      if (['ready_to_fulfil', 'fulfilled'].includes(o.status)) return { status: o.status, already: true };
      throw new CommerceError('order_not_paid');
    }
    await t.query('UPDATE orders SET email_encrypted=$2, email_submitted_at=now() WHERE id=$1', [o.id, encrypt(e1, key32)]);
    await transition(t, o.id, 'awaiting_email', 'ready_to_fulfil', { email: 'submitted' }, 'customer');
    const mode = o.market_mode || (await getSetting(t, 'fulfilment_mode', 'manual'));
    if (mode === 'auto' && !o.flags?.hold) {
      const r = await fulfilOrderTx(t, o.id, 'auto');
      return { status: 'ready_to_fulfil', queued: r.ok, mode };
    }
    return { status: 'ready_to_fulfil', mode };
  });
}
/** Admin correction of the customer's email (audit-logged by the caller). */
export async function setOrderEmail(db, { orderId, email, actor, key32 }) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(e)) throw new CommerceError('invalid_email');
  await db.tx(async t => {
    await t.query('UPDATE orders SET email_encrypted=$2, email_submitted_at=COALESCE(email_submitted_at, now()) WHERE id=$1', [orderId, encrypt(e, key32)]);
    await addEvent(t, orderId, 'email_corrected', {}, actor);
  });
}

/** Atomic allocation: a single UPDATE ... RETURNING with row locks (two orders can never get the same code). */
export async function allocateCode(t, orderId, codeId = null) {
  const r = codeId
    ? await t.query(`UPDATE codes SET status='reserved', reserved_at=now(), sold_order_id=$1 WHERE id=$2 AND status='available' RETURNING id`, [orderId, codeId])
    : await t.query(`UPDATE codes SET status='reserved', reserved_at=now(), sold_order_id=$1
        WHERE id = (SELECT id FROM codes WHERE status='available' ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`, [orderId]);
  return r.rows[0]?.id ?? null;
}
export async function queueEmail(t, orderId, template, locale, { delayMinutes = 0 } = {}) {
  await t.query(`INSERT INTO email_outbox (order_id, template, locale, next_attempt_at) VALUES ($1,$2,$3, now() + ($4::int * interval '1 minute'))`,
    [orderId, template, locale, delayMinutes]);
}
export async function fulfilOrderTx(t, orderId, actor = 'system', codeId = null) {
  const o = (await t.query('SELECT o.*, m.language FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.id=$1 FOR UPDATE', [orderId])).rows[0];
  if (!o) throw new CommerceError('not_found');
  if (o.status !== 'ready_to_fulfil') throw new CommerceError('order_not_ready', `status is ${o.status}`);
  if (!o.email_encrypted) throw new CommerceError('no_email');
  let cid = o.code_id;
  if (!cid) {
    cid = await allocateCode(t, o.id, codeId);
    if (!cid) {
      await t.query(`UPDATE orders SET flags = flags || '{"out_of_stock":true}'::jsonb WHERE id=$1`, [o.id]);
      await addEvent(t, o.id, 'out_of_stock', {}, actor);
      return { ok: false, reason: 'no_stock' };
    }
    await t.query(`UPDATE orders SET code_id=$2, flags = flags - 'out_of_stock' WHERE id=$1`, [o.id, cid]);
    await addEvent(t, o.id, 'code_assigned', { codeId: cid }, actor);
  }
  await queueEmail(t, o.id, 'code_delivered', o.language);
  return { ok: true, codeId: cid };
}
export const fulfilOrder = (db, orderId, actor, codeId) => db.tx(t => fulfilOrderTx(t, orderId, actor, codeId));

/** Queue a re-send of the delivery email (order already fulfilled or code assigned). */
export async function resendCode(db, { orderId, actor }) {
  return db.tx(async t => {
    const o = (await t.query('SELECT o.*, m.language FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!o || !o.code_id || !o.email_encrypted) throw new CommerceError('nothing_to_resend');
    await queueEmail(t, o.id, 'code_delivered', o.language);
    await addEvent(t, o.id, 'resend_queued', {}, actor);
  });
}

/** Called by the worker after the delivery email was accepted by the provider. */
export async function markDelivered(db, { outboxId, providerMsgId, key32 }) {
  return db.tx(async t => {
    const row = (await t.query(`UPDATE email_outbox SET status='sent', sent_at=now(), provider_msg_id=$2, last_error=NULL WHERE id=$1 RETURNING *`, [outboxId, providerMsgId])).rows[0];
    if (!row || row.template !== 'code_delivered') return row;
    const o = (await t.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [row.order_id])).rows[0];
    if (o.status === 'ready_to_fulfil') {
      await transition(t, o.id, 'ready_to_fulfil', 'fulfilled', {}, 'worker', 'fulfilled_at=now()');
      await t.query(`UPDATE codes SET status='sold' WHERE id=$1 AND status='reserved'`, [o.code_id]);
      const days = Number(await getSetting(t, 'review_invite_days', 3));
      const tok = reviewToken(o.id, key32);
      await t.query('INSERT INTO review_tokens (token_hash, order_id) VALUES ($1,$2) ON CONFLICT (order_id) DO NOTHING', [sha256Hex(tok), o.id]);
      const lang = (await t.query('SELECT language FROM markets WHERE id=$1', [o.market_id])).rows[0].language;
      await queueEmail(t, o.id, 'review_invitation', lang, { delayMinutes: days * 24 * 60 });
    }
    return row;
  });
}

// ---------- code inventory ----------
export async function importCodes(db, { source, notes = '', text, actor, key32 }) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.split(',')[0].trim().replace(/^"|"$/g, '')).filter(Boolean);
  const urls = [], rejected = [];
  for (const l of lines) {
    if (/^(url|link|redeem|code)/i.test(l) && !/^https?:/i.test(l)) continue;   // header row
    try { const u = new URL(l); if (u.protocol !== 'https:') throw 0; urls.push(u.toString()); } catch { rejected.push(l); }
  }
  const unique = [...new Set(urls)];
  return db.tx(async t => {
    const b = (await t.query('INSERT INTO code_batches (source, notes, imported_by) VALUES ($1,$2,$3) RETURNING id', [source || 'csv', notes, actor])).rows[0];
    let added = 0;
    for (const u of unique) {
      const r = await t.query('INSERT INTO codes (batch_id, redeem_url_encrypted, url_hash) VALUES ($1,$2,$3) ON CONFLICT (url_hash) DO NOTHING RETURNING id',
        [b.id, encrypt(u, key32), sha256Hex(u)]);
      if (r.rows[0]) added++;
    }
    await t.query('UPDATE code_batches SET count=$2 WHERE id=$1', [b.id, added]);
    return { batchId: b.id, added, duplicates: unique.length - added, rejected: rejected.length };
  });
}
export async function stockCounts(q) {
  const r = await q.query('SELECT status, count(*)::int AS n FROM codes GROUP BY status');
  const out = { available: 0, reserved: 0, sold: 0, void: 0 };
  for (const x of r.rows) out[x.status] = x.n;
  return out;
}
export async function voidCode(db, { codeId, actor }) {
  const r = await db.query(`UPDATE codes SET status='void' WHERE id=$1 AND status='available' RETURNING id`, [codeId]);
  if (!r.rows[0]) throw new CommerceError('code_not_available');
}

// ---------- refunds ----------
export async function requestRefund(db, { orderId, actor, reason = '' }) {
  return db.tx(async t => {
    const o = (await t.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
    if (!o) throw new CommerceError('not_found');
    const ok = await transition(t, orderId, o.status, 'refund_requested', { reason }, actor);
    if (!ok) throw new CommerceError('cannot_refund');
    return true;
  });
}
export async function decideRefund(db, { orderId, approve, actor, voidCodeToo = false }) {
  return db.tx(async t => {
    const to = approve ? 'refunded' : 'rejected';
    const o = await transition(t, orderId, 'refund_requested', to, {}, actor);
    if (!o) throw new CommerceError('not_refund_requested');
    if (approve && voidCodeToo && o.code_id) await t.query(`UPDATE codes SET status='void' WHERE id=$1`, [o.code_id]);
    return true;
  });
}

// ---------- reviews (verified buyers only; there is intentionally no "create review" for admins) ----------
export function reviewToken(orderId, key32 = loadKey()) {
  return hmacSha256Hex(key32, `review:${orderId}`).slice(0, 40);
}
export async function submitReview(db, { token, displayName, rating, body, language }) {
  const name = String(displayName || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const text = String(body || '').trim().slice(0, 1500);
  const stars = Number(rating);
  if (!name || text.length < 10 || !Number.isInteger(stars) || stars < 1 || stars > 5) throw new CommerceError('invalid_review');
  return db.tx(async t => {
    const tk = (await t.query('SELECT * FROM review_tokens WHERE token_hash=$1 FOR UPDATE', [sha256Hex(token || '')])).rows[0];
    if (!tk) throw new CommerceError('invalid_token');
    if (tk.used_at) throw new CommerceError('token_used');
    const o = (await t.query('SELECT o.*, m.language FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.id=$1', [tk.order_id])).rows[0];
    if (o.status !== 'fulfilled') throw new CommerceError('order_not_fulfilled');
    await t.query(`INSERT INTO reviews (order_id, market_id, display_name, rating, body, language, verified, status)
                   VALUES ($1,$2,$3,$4,$5,$6,TRUE,'pending')`, [o.id, o.market_id, name, stars, text, language || o.language]);
    await t.query('UPDATE review_tokens SET used_at=now() WHERE token_hash=$1', [tk.token_hash]);
    return true;
  });
}
export async function moderateReview(db, { reviewId, action, actor, reply = null, redactedBody = null }) {
  const map = { approve: "status='approved'", reject: "status='rejected'", feature: 'featured=TRUE', unfeature: 'featured=FALSE' };
  if (!map[action] && action !== 'reply' && action !== 'redact') throw new CommerceError('bad_action');
  if (action === 'reply') return db.query('UPDATE reviews SET reply=$2, moderated_by=$3 WHERE id=$1', [reviewId, String(reply || '').slice(0, 800), actor]);
  if (action === 'redact') return db.query('UPDATE reviews SET body=$2, edited=TRUE, moderated_by=$3 WHERE id=$1', [reviewId, String(redactedBody || '').slice(0, 1500), actor]);
  return db.query(`UPDATE reviews SET ${map[action]}, moderated_by=$2 WHERE id=$1`, [reviewId, actor]);
}
export async function approvedReviews(q, { marketCode = null, limit = 20 } = {}) {
  const r = await q.query(
    `SELECT r.display_name, r.rating, r.body, r.language, r.created_at, r.featured, r.reply, r.verified, r.imported, m.country_code
     FROM reviews r JOIN markets m ON m.id=r.market_id
     WHERE r.status='approved' AND ($1::text IS NULL OR m.code=$1) ORDER BY r.featured DESC, r.created_at DESC LIMIT $2`, [marketCode, limit]);
  return r.rows;
}

// ---------- helpers used by worker/admin ----------
export async function getOrderEmail(q, orderId, key32) {
  const r = (await q.query('SELECT email_encrypted FROM orders WHERE id=$1', [orderId])).rows[0];
  return r?.email_encrypted ? decrypt(r.email_encrypted, key32) : null;
}
export async function getRedeemUrl(q, codeId, key32) {
  const r = (await q.query('SELECT redeem_url_encrypted FROM codes WHERE id=$1', [codeId])).rows[0];
  return r ? decrypt(r.redeem_url_encrypted, key32) : null;
}

/** Wallet screening: hold an order for manual review (auto-fulfilment skips held orders). */
export async function holdOrder(db, { orderId, reason, actor = 'worker' }) {
  await db.tx(async t => {
    await t.query(`UPDATE orders SET flags = flags || $2::jsonb WHERE id=$1`, [orderId, JSON.stringify({ hold: true, holdReason: reason })]);
    await addEvent(t, orderId, 'held', { reason }, actor);
  });
}
export async function releaseHold(db, { orderId, actor }) {
  await db.tx(async t => {
    await t.query(`UPDATE orders SET flags = flags - 'hold' - 'holdReason' WHERE id=$1`, [orderId]);
    await addEvent(t, orderId, 'hold_released', {}, actor);
  });
}
