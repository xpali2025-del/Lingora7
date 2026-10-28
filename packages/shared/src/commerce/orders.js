import { randomInt } from 'node:crypto';
import { sha256Hex, randomToken, safeEqual } from '../crypto.js';
import { parseAmount, formatAmount, withOffset } from '../money.js';
import { CommerceError } from './errors.js';
import { addEvent } from './state.js';
import { getSetting } from './settings.js';

const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // no 0/O/1/I/L
const newRef = () => 'LG-' + Array.from({ length: 8 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join('');
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
    const amount = withOffset(basePrice, free[randomInt(free.length)]);
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
