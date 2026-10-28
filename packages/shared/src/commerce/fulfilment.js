import { encrypt, decrypt, sha256Hex } from '../crypto.js';
import { CommerceError } from './errors.js';
import { addEvent, transition } from './state.js';
import { getSetting } from './settings.js';
import { getOrderByRefKey } from './orders.js';
import { reviewToken } from './reviews.js';

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
    return readyForFulfilment(t, o);
  });
}
/** awaiting_email -> ready_to_fulfil, then fulfil right away in auto mode (unless the order is on hold). Shared by guests and wallet buyers. */
export async function readyForFulfilment(t, o) {
  await transition(t, o.id, 'awaiting_email', 'ready_to_fulfil', { email: 'submitted' }, 'customer');
  const mode = o.market_mode || (await getSetting(t, 'fulfilment_mode', 'manual'));
  if (mode === 'auto' && !o.flags?.hold) {
    const r = await fulfilOrderTx(t, o.id, 'auto');
    return { status: 'ready_to_fulfil', queued: r.ok, mode };
  }
  return { status: 'ready_to_fulfil', mode };
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

// ---------- helpers used by worker/admin ----------
export async function getOrderEmail(q, orderId, key32) {
  const r = (await q.query('SELECT email_encrypted FROM orders WHERE id=$1', [orderId])).rows[0];
  return r?.email_encrypted ? decrypt(r.email_encrypted, key32) : null;
}
export async function getRedeemUrl(q, codeId, key32) {
  const r = (await q.query('SELECT redeem_url_encrypted FROM codes WHERE id=$1', [codeId])).rows[0];
  return r ? decrypt(r.redeem_url_encrypted, key32) : null;
}
