import { CommerceError } from './errors.js';

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
