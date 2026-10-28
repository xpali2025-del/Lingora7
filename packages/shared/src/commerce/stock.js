import { getSetting } from './settings.js';
import { CommerceError } from './errors.js';

/** Codes that can still be promised: available minus paid orders that are waiting for one. */
export async function sellableStock(q) {
  const r = await q.query(`SELECT
      (SELECT count(*)::int FROM codes WHERE status='available') AS available,
      (SELECT count(*)::int FROM orders WHERE status IN ('paid','awaiting_email','ready_to_fulfil') AND code_id IS NULL) AS pending`);
  return Math.max(0, r.rows[0].available - r.rows[0].pending);
}
/** Refuse a new order when nothing is left to deliver (setting block_orders_when_out_of_stock, on by default). */
export async function assertInStock(q) {
  if (!(await getSetting(q, 'block_orders_when_out_of_stock', true))) return;
  if ((await sellableStock(q)) <= 0) throw new CommerceError('out_of_stock');
}
