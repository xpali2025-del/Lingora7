import { getDb, createEmailSender, loadKey } from '@lingora/shared';
import { createAlerter } from './alerts.js';
import { runOnce } from './loop.js';

const key32 = loadKey();
const db = getDb();
const sender = createEmailSender();
const alerter = createAlerter(db);
const ctx = { db, sender, alerter, key32, siteUrl: process.env.SITE_URL || 'https://lingora.world', supportEmail: process.env.EMAIL_FROM || 'support@lingora.world' };
const intervalMs = Number(process.env.WORKER_POLL_SECONDS || 20) * 1000;
let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopping = true; });

console.log(`worker started (poll ${intervalMs / 1000}s, email provider ${sender.provider})`);
while (!stopping) {
  try { const r = await runOnce(ctx); if (Object.keys(r.payments).length || r.mail.sent || r.expired) console.log(new Date().toISOString(), JSON.stringify(r)); }
  catch (e) { console.error('worker tick failed:', e.message); await alerter.alert(`Worker tick failed: ${e.message}`, 'worker_error').catch(() => {}); }
  await new Promise(r => setTimeout(r, intervalMs));
}
await db.close(); console.log('worker stopped');
