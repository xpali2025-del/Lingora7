import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/commerce.js';
import { makeDb, KEY, ADDR, providerId, deposit, SAMPLE_URLS } from './helpers.js';
import { parseAmount } from '../src/money.js';

const OPTS = pid => ({ providerId: pid, requiredConfirmations: 15 });
async function paidOrder(db, market = 'ar-eg') {
  const pid = await providerId(db); const o = await C.createOrder(db, { marketCode: market });
  const r = await C.recordPayment(db, deposit(o.amount), OPTS(pid)); assert.equal(r.result, 'matched');
  return o;
}
const status = async (db, ref) => (await db.query('SELECT status FROM orders WHERE public_ref=$1', [ref])).rows[0].status;

test('price comes from the market tier table: 13 arab / 15 intl; unique amount is base + 0.0001..0.0099', async () => {
  const db = await makeDb();
  const a = await C.createOrder(db, { marketCode: 'ar-eg' }), b = await C.createOrder(db, { marketCode: 'en-gb' });
  assert.equal(a.priceUsdt, '13.00'); assert.equal(b.priceUsdt, '15.00');
  const off = x => Number(parseAmount(x.amount) - parseAmount(x.priceUsdt)) / 1e14;
  assert.ok(off(a) >= 1 && off(a) <= 99); assert.ok(off(b) >= 1 && off(b) <= 99);
  assert.equal(a.address, ADDR); assert.equal(a.network, 'BSC');
});
test('draft/disabled market and unconfigured provider are refused', async () => {
  const db = await makeDb();
  await assert.rejects(C.createOrder(db, { marketCode: 'de-de' }), { code: 'market_unavailable' });
  const db2 = await makeDb({ configureProvider: false });
  await assert.rejects(C.createOrder(db2, { marketCode: 'ar-eg' }), { code: 'no_payment_method' });
});
test('price tampering from the client has no effect (createOrder takes no price input)', async () => {
  const db = await makeDb();
  const o = await C.createOrder(db, { marketCode: 'ar-eg', price: 0.01, priceUsdt: '0.01' });
  assert.equal(o.priceUsdt, '13.00');
  assert.equal((await db.query('SELECT price_usdt FROM orders WHERE public_ref=$1', [o.ref])).rows[0].price_usdt.startsWith('13'), true);
});
test('50 simultaneous orders never share an amount', async () => {
  const db = await makeDb();
  const orders = await Promise.all(Array.from({ length: 50 }, () => C.createOrder(db, { marketCode: 'ar-eg' })));
  assert.equal(new Set(orders.map(o => o.amount)).size, 50);
  assert.equal(new Set(orders.map(o => o.ref)).size, 50);
});
test('the DB itself rejects two open orders with the same amount', async () => {
  const db = await makeDb(); const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  const pid = await providerId(db);
  await assert.rejects(db.query(`INSERT INTO orders (public_ref,key_hash,market_id,provider_id,price_usdt,unique_amount,expires_at)
    SELECT 'LG-DUP00001','x',market_id,provider_id,price_usdt,unique_amount,expires_at FROM orders WHERE public_ref=$1`, [o.ref]));
});
test('exact payment inside the window is matched, confirmed and fulfils once', async () => {
  const db = await makeDb(); const pid = await providerId(db);
  const o = await C.createOrder(db, { marketCode: 'ar-sa' });
  const ev = deposit(o.amount);
  assert.equal((await C.recordPayment(db, ev, OPTS(pid))).result, 'matched');
  assert.equal(await status(db, o.ref), 'awaiting_email');
  assert.equal((await C.recordPayment(db, ev, OPTS(pid))).result, 'duplicate');            // same tx reported twice
  assert.equal((await db.query('SELECT count(*)::int n FROM payments')).rows[0].n, 1);
  assert.equal(await status(db, o.ref), 'awaiting_email');
});
test('confirmations gate: paid_unconfirmed until enough blocks', async () => {
  const db = await makeDb(); const pid = await providerId(db); const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  const ev = deposit(o.amount, { confirmations: 3 });
  await C.recordPayment(db, ev, OPTS(pid)); assert.equal(await status(db, o.ref), 'paid_unconfirmed');
  assert.equal((await C.recordPayment(db, { ...ev, confirmations: 9 }, OPTS(pid))).result, 'duplicate');
  assert.equal(await status(db, o.ref), 'paid_unconfirmed');
  assert.equal((await C.recordPayment(db, { ...ev, confirmations: 15 }, OPTS(pid))).result, 'confirmed');
  assert.equal(await status(db, o.ref), 'awaiting_email');
});
test('one payment can never fulfil two orders; a second payment of the same amount is unmatched', async () => {
  const db = await makeDb(); const pid = await providerId(db); const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  await C.recordPayment(db, deposit(o.amount), OPTS(pid));
  const r2 = await C.recordPayment(db, deposit(o.amount), OPTS(pid));
  assert.equal(r2.result, 'unmatched');
});
test('late payment (after expiry) goes to the unmatched queue and is never auto-fulfilled', async () => {
  const db = await makeDb(); const pid = await providerId(db); const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  await db.query(`UPDATE orders SET expires_at = now() - interval '1 minute' WHERE public_ref=$1`, [o.ref]);
  assert.equal(await C.expireOrders(db), 1); assert.equal(await status(db, o.ref), 'expired');
  const r = await C.recordPayment(db, deposit(o.amount), OPTS(pid)); assert.equal(r.result, 'unmatched');
  assert.equal(await status(db, o.ref), 'expired');
  const ev = (await db.query(`SELECT type FROM order_events WHERE order_id=(SELECT id FROM orders WHERE public_ref=$1)`, [o.ref])).rows.map(x => x.type);
  assert.ok(ev.includes('late_payment'));
});
test('wrong asset or network is ignored, not matched', async () => {
  const db = await makeDb(); const pid = await providerId(db); const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  assert.equal((await C.recordPayment(db, deposit(o.amount, { network: 'ETH' }), OPTS(pid))).result, 'ignored');
  assert.equal((await C.recordPayment(db, deposit(o.amount, { asset: 'BNB' }), OPTS(pid))).result, 'ignored');
  assert.equal(await status(db, o.ref), 'awaiting_payment');
});
test('wrong amount does not match; admin resolves underpaid and overpaid', async () => {
  const db = await makeDb(); const pid = await providerId(db);
  const o1 = await C.createOrder(db, { marketCode: 'ar-eg' }), o2 = await C.createOrder(db, { marketCode: 'ar-eg' });
  const under = deposit('12.5'), over = deposit('14.2');
  assert.equal((await C.recordPayment(db, under, OPTS(pid))).result, 'unmatched');
  assert.equal((await C.recordPayment(db, over, OPTS(pid))).result, 'unmatched');
  const pUnder = (await db.query(`SELECT id FROM payments WHERE tx_hash=$1`, [under.txRef])).rows[0].id;
  const pOver = (await db.query(`SELECT id FROM payments WHERE tx_hash=$1`, [over.txRef])).rows[0].id;
  assert.equal((await C.matchPaymentToOrder(db, { paymentId: pUnder, orderId: (await db.query('SELECT id FROM orders WHERE public_ref=$1', [o1.ref])).rows[0].id, actor: 'admin:1' })).outcome, 'underpaid');
  assert.equal(await status(db, o1.ref), 'underpaid');
  const r = await C.matchPaymentToOrder(db, { paymentId: pOver, orderId: (await db.query('SELECT id FROM orders WHERE public_ref=$1', [o2.ref])).rows[0].id, actor: 'admin:1' });
  assert.equal(r.outcome, 'overpaid_accepted'); assert.equal(await status(db, o2.ref), 'awaiting_email');
  assert.ok((await db.query('SELECT flags FROM orders WHERE public_ref=$1', [o2.ref])).rows[0].flags.overpaid);
  await C.acceptUnderpaid(db, { orderId: (await db.query('SELECT id FROM orders WHERE public_ref=$1', [o1.ref])).rows[0].id, actor: 'admin:1' });
  assert.equal(await status(db, o1.ref), 'awaiting_email');
});
test('order page view never exposes email or code; wrong key is refused', async () => {
  const db = await makeDb(); const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  assert.equal(await C.getOrderForClient(db, o.ref, 'wrong'), null);
  const v = await C.getOrderForClient(db, o.ref, o.key);
  assert.equal(v.status, 'awaiting_payment'); assert.ok(!('email' in v) && !('code' in v)); assert.equal(v.amount, o.amount);
});
test('email: must be entered twice and valid; stored encrypted; manual mode waits for admin', async () => {
  const db = await makeDb(); const o = await paidOrder(db);
  await assert.rejects(C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'x@b.co', key32: KEY }), { code: 'email_mismatch' });
  await assert.rejects(C.submitEmail(db, { ref: o.ref, key: o.key, email: 'nope', emailConfirm: 'nope', key32: KEY }), { code: 'invalid_email' });
  await assert.rejects(C.submitEmail(db, { ref: o.ref, key: 'bad', email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY }), { code: 'not_found' });
  const r = await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'Buyer@Example.com', emailConfirm: 'buyer@example.com', key32: KEY });
  assert.equal(r.status, 'ready_to_fulfil'); assert.equal(r.mode, 'manual');
  const row = (await db.query('SELECT id, email_encrypted FROM orders WHERE public_ref=$1', [o.ref])).rows[0];
  assert.ok(row.email_encrypted.startsWith('v1:') && !row.email_encrypted.includes('buyer'));
  assert.equal(await C.getOrderEmail(db, row.id, KEY), 'buyer@example.com');
  assert.equal((await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'buyer@example.com', emailConfirm: 'buyer@example.com', key32: KEY })).already, true);
  assert.equal((await db.query(`SELECT count(*)::int n FROM email_outbox`)).rows[0].n, 0);
});
test('unpaid order cannot receive an email', async () => {
  const db = await makeDb(); const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  await assert.rejects(C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY }), { code: 'order_not_paid' });
});
test('code import: https only, de-duplicated, encrypted at rest; stock counts', async () => {
  const db = await makeDb();
  const text = ['redeem_url', SAMPLE_URLS(1), SAMPLE_URLS(2), SAMPLE_URLS(2), 'http://insecure.example/x', 'not a url'].join('\n');
  const r = await C.importCodes(db, { source: 'csv', text, actor: 'admin:1', key32: KEY });
  assert.deepEqual([r.added, r.duplicates, r.rejected], [2, 0, 2]);
  const again = await C.importCodes(db, { source: 'csv', text: SAMPLE_URLS(1), actor: 'admin:1', key32: KEY });
  assert.equal(again.added, 0); assert.equal(again.duplicates, 1);
  assert.deepEqual(await C.stockCounts(db), { available: 2, reserved: 0, sold: 0, void: 0 });
  const raw = (await db.query('SELECT redeem_url_encrypted FROM codes LIMIT 1')).rows[0].redeem_url_encrypted;
  assert.ok(!raw.includes('duolingo'));
});
test('auto mode: email entry allocates a code and queues delivery; worker confirmation marks it fulfilled + schedules review invite', async () => {
  const db = await makeDb();
  await C.setSetting(db, 'fulfilment_mode', 'auto');
  await C.importCodes(db, { text: SAMPLE_URLS(1), actor: 'a', key32: KEY });
  const o = await paidOrder(db);
  const r = await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY });
  assert.equal(r.queued, true);
  const box = (await db.query(`SELECT * FROM email_outbox WHERE template='code_delivered'`)).rows;
  assert.equal(box.length, 1); assert.equal(box[0].locale, 'ar');
  assert.equal(await status(db, o.ref), 'ready_to_fulfil');
  await C.markDelivered(db, { outboxId: box[0].id, providerMsgId: 'msg-1', key32: KEY });
  assert.equal(await status(db, o.ref), 'fulfilled');
  assert.equal((await C.stockCounts(db)).sold, 1);
  const inv = (await db.query(`SELECT * FROM email_outbox WHERE template='review_invitation'`)).rows[0];
  assert.ok(inv && new Date(inv.next_attempt_at) > new Date(Date.now() + 2 * 86400000));
});
test('out of stock keeps the order ready_to_fulfil and flags it; adding stock then fulfils', async () => {
  const db = await makeDb(); await C.setSetting(db, 'fulfilment_mode', 'auto');
  const o = await paidOrder(db);
  const r = await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY });
  assert.equal(r.queued, false);
  const row = (await db.query('SELECT id, flags FROM orders WHERE public_ref=$1', [o.ref])).rows[0];
  assert.equal(row.flags.out_of_stock, true);
  await C.importCodes(db, { text: SAMPLE_URLS(9), actor: 'a', key32: KEY });
  assert.equal((await C.fulfilOrder(db, row.id, 'admin:1')).ok, true);
  assert.equal((await db.query('SELECT flags FROM orders WHERE id=$1', [row.id])).rows[0].flags.out_of_stock, undefined);
});
test('two simultaneous fulfilments never get the same code', async () => {
  const db = await makeDb();
  await C.importCodes(db, { text: Array.from({ length: 6 }, (_, i) => SAMPLE_URLS(i)).join('\n'), actor: 'a', key32: KEY });
  const ids = [];
  for (let i = 0; i < 6; i++) { const o = await paidOrder(db); await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY }); ids.push((await db.query('SELECT id FROM orders WHERE public_ref=$1', [o.ref])).rows[0].id); }
  const res = await Promise.all(ids.map(id => C.fulfilOrder(db, id, 'admin:1')));
  assert.ok(res.every(r => r.ok)); assert.equal(new Set(res.map(r => r.codeId)).size, 6);
  const d = await C.fulfilOrder(db, ids[0], 'admin:1');           // idempotent: same code, no second allocation
  assert.equal(d.codeId, res[0].codeId);
  assert.equal((await C.stockCounts(db)).reserved, 6);
});
test('refund flow and void code', async () => {
  const db = await makeDb(); await C.setSetting(db, 'fulfilment_mode', 'auto');
  await C.importCodes(db, { text: SAMPLE_URLS(1), actor: 'a', key32: KEY });
  const o = await paidOrder(db); await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY });
  const id = (await db.query('SELECT id FROM orders WHERE public_ref=$1', [o.ref])).rows[0].id;
  const box = (await db.query(`SELECT id FROM email_outbox WHERE template='code_delivered'`)).rows[0];
  await C.markDelivered(db, { outboxId: box.id, providerMsgId: 'm', key32: KEY });
  await C.requestRefund(db, { orderId: id, actor: 'admin:1', reason: 'link failed' });
  await C.decideRefund(db, { orderId: id, approve: true, actor: 'admin:1', voidCodeToo: true });
  assert.equal(await status(db, o.ref), 'refunded'); assert.equal((await C.stockCounts(db)).void, 1);
  await assert.rejects(C.decideRefund(db, { orderId: id, approve: true, actor: 'x' }), { code: 'not_refund_requested' });
});
test('invalid state transitions are refused', () => {
  assert.equal(C.canTransition('awaiting_payment', 'fulfilled'), false);
  assert.equal(C.canTransition('expired', 'fulfilled'), false);
  assert.equal(C.canTransition('paid_unconfirmed', 'paid'), true);
  assert.equal(C.canTransition('refunded', 'paid'), false);
});
test('reviews: only the real buyer (one-time token), country from the order market, moderated, no admin create', async () => {
  const db = await makeDb(); await C.setSetting(db, 'fulfilment_mode', 'auto');
  await C.importCodes(db, { text: SAMPLE_URLS(1), actor: 'a', key32: KEY });
  const o = await paidOrder(db, 'ar-ae'); await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY });
  const id = (await db.query('SELECT id FROM orders WHERE public_ref=$1', [o.ref])).rows[0].id;
  const tok = C.reviewToken(id, KEY);
  await assert.rejects(C.submitReview(db, { token: tok, displayName: 'Sara K.', rating: 5, body: 'Worked perfectly, thanks!' }), { code: 'invalid_token' });   // not delivered yet
  const box = (await db.query(`SELECT id FROM email_outbox WHERE template='code_delivered'`)).rows[0];
  await C.markDelivered(db, { outboxId: box.id, providerMsgId: 'm', key32: KEY });
  await assert.rejects(C.submitReview(db, { token: 'forged', displayName: 'x', rating: 5, body: 'long enough text' }), { code: 'invalid_token' });
  await assert.rejects(C.submitReview(db, { token: tok, displayName: 'Sara K.', rating: 9, body: 'Worked perfectly, thanks!' }), { code: 'invalid_review' });
  await C.submitReview(db, { token: tok, displayName: 'Sara K.', rating: 5, body: 'Worked perfectly, thanks!', language: 'en' });
  await assert.rejects(C.submitReview(db, { token: tok, displayName: 'Sara K.', rating: 5, body: 'Second attempt here ok' }), { code: 'token_used' });
  assert.equal((await C.approvedReviews(db, { marketCode: 'ar-ae' })).length, 0);            // pending until moderated
  const rid = (await db.query('SELECT id, verified FROM reviews')).rows[0];
  assert.equal(rid.verified, true);
  await C.moderateReview(db, { reviewId: rid.id, action: 'approve', actor: 'admin:2' });
  const pub = await C.approvedReviews(db, { marketCode: 'ar-ae' });
  assert.equal(pub.length, 1); assert.equal(pub[0].country_code, 'AE');
  assert.equal((await C.approvedReviews(db, { marketCode: 'ar-eg' })).length, 0);
});
test('rate limiter and per-IP open-order cap', async () => {
  const db = await makeDb();
  const r = []; for (let i = 0; i < 4; i++) r.push(await C.rateLimit(db, 'ip:1', 3, 60));
  assert.deepEqual(r, [true, true, true, false]);
  for (let i = 0; i < 5; i++) await C.createOrder(db, { marketCode: 'ar-eg', ipHash: 'h1' });
  await assert.rejects(C.createOrder(db, { marketCode: 'ar-eg', ipHash: 'h1' }), { code: 'too_many_open_orders' });
  await C.createOrder(db, { marketCode: 'ar-eg', ipHash: 'h2' });
});
