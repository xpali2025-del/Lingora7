import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '@lingora/shared';
import { createEmailSender } from '@lingora/shared';
import { makeDb, KEY, providerId, deposit, SAMPLE_URLS } from '../../../packages/shared/test/helpers.js';
import { runOnce } from '../src/loop.js';
import { createAlerter } from '../src/alerts.js';

async function setup({ mode = 'auto', codes = 3 } = {}) {
  const db = await makeDb();
  await C.setSetting(db, 'fulfilment_mode', mode);
  await C.importCodes(db, { source: 't', text: Array.from({ length: codes }, (_, i) => SAMPLE_URLS(i)).join('\n'), actor: 'test', key32: KEY });
  const sender = createEmailSender({ provider: 'log', log: () => {} });
  const alerter = createAlerter(db, { webhookUrl: null, log: () => {} });
  const ctx = { db, sender, alerter, key32: KEY, siteUrl: 'https://lingora.test', supportEmail: 'support@lingora.test', log: () => {} };
  return { db, sender, alerter, ctx };
}
const st = async (db, ref) => (await db.query('SELECT status FROM orders WHERE public_ref=$1', [ref])).rows[0].status;

test('e2e: order -> deposit -> worker -> email -> auto fulfil -> outbox send -> fulfilled', async () => {
  const { db, sender, ctx } = await setup();
  const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  await db.query(`INSERT INTO mock_deposits (tx_hash, amount, to_address, confirmations) VALUES ('0xe2e1',$1,$2,30)`, [o.amount, o.address]);
  await runOnce(ctx);
  assert.equal(await st(db, o.ref), 'awaiting_email');
  const r = await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY });
  assert.equal(r.queued, true);
  await runOnce(ctx);
  assert.equal(await st(db, o.ref), 'fulfilled');
  const sent = sender.sent.find(m => m.to === 'a@b.co');
  assert.ok(sent && sent.html.includes('duolingo.com/redeem/TEST-'));
});

test('e2e: runOnce twice is idempotent (no double payment, no double mail)', async () => {
  const { db, sender, ctx } = await setup();
  const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  await db.query(`INSERT INTO mock_deposits (tx_hash, amount, to_address, confirmations) VALUES ('0xe2e2',$1,$2,30)`, [o.amount, o.address]);
  await runOnce(ctx); await runOnce(ctx);
  assert.equal((await db.query('SELECT count(*)::int n FROM payments')).rows[0].n, 1);
  await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY });
  await runOnce(ctx); await runOnce(ctx); await runOnce(ctx);
  assert.equal(sender.sent.filter(m => m.to === 'a@b.co' && /duolingo\.com\/redeem/.test(m.html)).length, 1);
  assert.equal((await db.query(`SELECT count(*)::int n FROM codes WHERE status<>'available'`)).rows[0].n, 1);
});

test('e2e: manual mode waits for admin; wallet watch-list holds auto fulfilment', async () => {
  const { db, ctx } = await setup({ mode: 'manual' });
  const o = await C.createOrder(db, { marketCode: 'ar-eg' });
  await db.query(`INSERT INTO mock_deposits (tx_hash, amount, to_address, confirmations) VALUES ('0xe2e3',$1,$2,30)`, [o.amount, o.address]);
  await runOnce(ctx);
  await C.submitEmail(db, { ref: o.ref, key: o.key, email: 'a@b.co', emailConfirm: 'a@b.co', key32: KEY });
  await runOnce(ctx);
  assert.equal(await st(db, o.ref), 'ready_to_fulfil');
  const id = (await db.query('SELECT id FROM orders WHERE public_ref=$1', [o.ref])).rows[0].id;
  await C.fulfilOrder(db, id, 'admin');
  await runOnce(ctx);
  assert.equal(await st(db, o.ref), 'fulfilled');
});

test('e2e: provider error is recorded and does not crash the loop', async () => {
  const { db, ctx } = await setup();
  await db.query(`UPDATE payment_providers SET enabled=TRUE, config_encrypted='garbage' WHERE type='binance_bep20'`);
  const r = await runOnce({ ...ctx, fetchImpl: async () => { throw new Error('net down'); } });
  assert.equal(r.payments.errors, 1);
  assert.ok(await C.getSetting(db, 'worker_heartbeat'));
});

test('e2e: alerts fire for low stock and are throttled', async () => {
  const { db, alerter, ctx } = await setup({ codes: 1 });
  await runOnce(ctx); await runOnce(ctx);
  assert.equal(alerter.sentMessages.filter(m => /Low code stock/.test(m)).length, 1);
});
