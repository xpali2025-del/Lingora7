import { parseAmount, formatAmount, cmpAmounts } from '../money.js';
import { CommerceError } from './errors.js';
import { addEvent, transition } from './state.js';

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
  // One statement: the status change and its audit event commit together or not at all.
  const r = await db.query(
    `WITH expired AS (UPDATE orders SET status='expired' WHERE status='awaiting_payment' AND expires_at < now() RETURNING id)
     INSERT INTO order_events (order_id, type, data, actor) SELECT id, 'status:expired', '{"from":"awaiting_payment"}'::jsonb, 'system' FROM expired RETURNING order_id`);
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
