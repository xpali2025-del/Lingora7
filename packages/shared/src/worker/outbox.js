import { getOrderEmail, getRedeemUrl, markDelivered, reviewToken, getSetting } from '../commerce.js';
import { renderEmail } from '../email/templates.js';

const MAX_ATTEMPTS = 5;
export const backoffMinutes = attempts => Math.min(2 ** attempts, 60);   // 2,4,8,16,32,60

async function override(db, template, lang) {
  return getSetting(db, `email_template:${template}:${lang}`, null);
}
/** Sends due outbox rows. Retry-safe: a failed send is rescheduled with backoff; the order only becomes
 *  'fulfilled' after the provider accepted the delivery email. */
export async function processOutbox(db, sender, { key32, siteUrl, supportEmail, limit = 20, alert = async () => {} }) {
  // recover rows stuck in 'sending' after a crash
  await db.query(`UPDATE email_outbox SET status='pending' WHERE status='sending' AND next_attempt_at < now() - interval '10 minutes'`);
  const claimed = (await db.query(
    `UPDATE email_outbox SET status='sending', attempts=attempts+1, next_attempt_at=now()
     WHERE id IN (SELECT id FROM email_outbox WHERE status='pending' AND next_attempt_at <= now() ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
     RETURNING *`, [limit])).rows;
  const out = { sent: 0, failed: 0, cancelled: 0 };
  for (const row of claimed) {
    try {
      const order = (await db.query('SELECT o.*, m.code AS market_code FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.id=$1', [row.order_id])).rows[0];
      const to = await getOrderEmail(db, row.order_id, key32);
      if (!to) throw new Error('order has no email');
      const data = { ref: order.public_ref, supportEmail, siteUrl };
      if (row.template === 'code_delivered') {
        if (!order.code_id) throw new Error('order has no code assigned');
        data.redeemUrl = await getRedeemUrl(db, order.code_id, key32);
      }
      if (row.template === 'review_invitation') {
        const tk = (await db.query('SELECT used_at FROM review_tokens WHERE order_id=$1', [order.id])).rows[0];
        if (!tk || tk.used_at || order.status !== 'fulfilled') { await db.query(`UPDATE email_outbox SET status='cancelled' WHERE id=$1`, [row.id]); out.cancelled++; continue; }
        data.reviewUrl = `${siteUrl}/${['ar', 'hi', 'fr', 'zh'].includes(String(row.locale).slice(0, 2)) ? String(row.locale).slice(0, 2) : 'en'}/review/?t=${reviewToken(order.id, key32)}`;
      }
      const msg = renderEmail(row.template, row.locale, data, await override(db, row.template, row.locale));
      const { id } = await sender.send({ to, subject: msg.subject, html: msg.html, text: msg.text });
      if (row.template === 'code_delivered') await markDelivered(db, { outboxId: row.id, providerMsgId: id, key32 });
      else await db.query(`UPDATE email_outbox SET status='sent', sent_at=now(), provider_msg_id=$2, last_error=NULL WHERE id=$1`, [row.id, id]);
      out.sent++;
    } catch (e) {
      const dead = row.attempts >= MAX_ATTEMPTS;
      await db.query(`UPDATE email_outbox SET status=$2, last_error=$3, next_attempt_at=now() + ($4::int * interval '1 minute') WHERE id=$1`,
        [row.id, dead ? 'failed' : 'pending', String(e.message).slice(0, 300), backoffMinutes(row.attempts)]);
      out.failed++;
      if (dead) await alert(`Email to order ${row.order_id} failed ${MAX_ATTEMPTS} times (${row.template}): ${e.message}`);
    }
  }
  return out;
}
