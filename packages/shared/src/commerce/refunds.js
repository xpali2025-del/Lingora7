import { CommerceError } from './errors.js';
import { transition } from './state.js';

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
