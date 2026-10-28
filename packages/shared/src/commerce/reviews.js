import { sha256Hex, hmacSha256Hex, loadKey } from '../crypto.js';
import { CommerceError } from './errors.js';

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
