import { recordPayment, expireOrders, resolveProvider, loadConfig, requiredConfirmationsFor, getSetting, setSetting, holdOrder } from '@lingora/shared';
import { processOutbox } from './outbox.js';
import { runChecks } from './alerts.js';

async function pollProviders(db, { key32, fetchImpl, log }) {
  const rows = (await db.query(`SELECT * FROM payment_providers WHERE enabled AND type IN ('binance_bep20','mock')`)).rows;
  const summary = {};
  for (const row of rows) {
    const cursorKey = `cursor:${row.id}`;
    try {
      const provider = resolveProvider(row), cfg = loadConfig(row, key32);
      const cursor = await getSetting(db, cursorKey, null);
      const { events, cursor: next } = await provider.fetchEvents(cfg, { cursor, db, fetchImpl });
      const opts = { providerId: row.id, requiredConfirmations: requiredConfirmationsFor(row) };
      const flagged = new Set((await getSetting(db, 'flagged_wallets', [])).map(w => String(w).toLowerCase()));
      for (const ev of events) {
        const r = await recordPayment(db, ev, opts);
        summary[r.result] = (summary[r.result] || 0) + 1;
        const from = String(ev.raw?.from || '').toLowerCase();
        if (r.orderId && from && flagged.has(from) && r.result === 'matched') await holdOrder(db, { orderId: r.orderId, reason: `payer wallet ${from} is on the watch list` });
      }
      await setSetting(db, cursorKey, next);
    } catch (e) { log(`provider ${row.type} error: ${e.message}`); summary.errors = (summary.errors || 0) + 1; await setSetting(db, `provider_error:${row.id}`, { at: Date.now(), message: e.message }); }
  }
  return summary;
}
/** Admin pressed "Test connection": the worker runs it from its static IP (the web host cannot). */
async function runPendingTests(db, { key32, fetchImpl }) {
  const rows = (await db.query('SELECT * FROM payment_providers WHERE test_requested_at IS NOT NULL')).rows;
  for (const row of rows) {
    let res;
    try { res = await resolveProvider(row).testConnection(loadConfig(row, key32), { fetchImpl, db }); } catch (e) { res = { ok: false, message: e.message }; }
    await db.query('UPDATE payment_providers SET last_test_at=now(), last_test_ok=$2, last_test_message=$3, test_requested_at=NULL WHERE id=$1', [row.id, res.ok, String(res.message).slice(0, 300)]);
  }
}

export async function runOnce(ctx) {
  const { db, sender, alerter, key32, siteUrl, supportEmail, fetchImpl = fetch, log = console.log } = ctx;
  const expired = await expireOrders(db);
  await runPendingTests(db, { key32, fetchImpl });
  const payments = await pollProviders(db, { key32, fetchImpl, log });
  const mail = await processOutbox(db, sender, { key32, siteUrl, supportEmail, alert: m => alerter.alert(m, 'email_dead') });
  await runChecks(db, alerter);
  await setSetting(db, 'worker_heartbeat', Date.now());
  return { expired, payments, mail };
}
