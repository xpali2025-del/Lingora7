import { addEvent } from './state.js';

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
