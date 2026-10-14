import { getSetting, setSetting } from '@lingora/shared';

/** Owner alerts: webhook (e.g. a WhatsApp/Telegram bridge) + console. Each alert key is throttled. */
export function createAlerter(db, { webhookUrl = process.env.ALERT_WEBHOOK_URL, fetchImpl = fetch, log = console.warn, cooldownMinutes = 360 } = {}) {
  const sentMessages = [];
  async function alert(message, key = message.slice(0, 60)) {
    const last = await getSetting(db, `alert_last:${key}`, 0);
    if (Date.now() - Number(last) < cooldownMinutes * 60e3) return false;
    await setSetting(db, `alert_last:${key}`, Date.now());
    sentMessages.push(message); log(`[ALERT] ${message}`);
    if (webhookUrl) { try { await fetchImpl(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `Lingora: ${message}` }) }); } catch (e) { log(`alert webhook failed: ${e.message}`); } }
    return true;
  }
  return { alert, sentMessages };
}
/** Periodic health checks from plan section 12. */
export async function runChecks(db, alerter) {
  const thr = Number(await getSetting(db, 'low_stock_threshold', 5));
  const stock = Number((await db.query(`SELECT count(*) n FROM codes WHERE status='available'`)).rows[0].n);
  if (stock < thr) await alerter.alert(`Low code stock: ${stock} available (threshold ${thr})`, 'low_stock');
  const stuck = Number((await db.query(`SELECT count(*) n FROM orders WHERE status IN ('paid_unconfirmed','ready_to_fulfil') AND COALESCE(paid_at, created_at) < now() - interval '15 minutes'`)).rows[0].n);
  if (stuck) await alerter.alert(`${stuck} paid order(s) not fulfilled after 15 minutes`, 'stuck_orders');
  const un = Number((await db.query(`SELECT count(*) n FROM payments WHERE status='unmatched'`)).rows[0].n);
  if (un) await alerter.alert(`${un} unmatched payment(s) waiting in the admin queue`, 'unmatched');
  const failed = Number((await db.query(`SELECT count(*) n FROM email_outbox WHERE status='failed'`)).rows[0].n);
  if (failed) await alerter.alert(`${failed} email(s) failed permanently`, 'email_failed');
}
