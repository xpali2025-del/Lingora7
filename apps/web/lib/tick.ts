import { createEmailSender, createAlerter, tick } from '@lingora/shared';
import { db, key32, SITE } from './server';

/** One guarded pass of the background work (payments, delivery e-mails, expiry, alerts). Safe to call from many places. */
export async function runTick(minIntervalSec = 20) {
  const alerter = createAlerter(db());
  return tick({ db: db(), sender: createEmailSender(), alerter, key32: key32(), siteUrl: SITE(), supportEmail: process.env.EMAIL_FROM || process.env.SUPPORT_EMAIL || 'support@lingora.world' }, { minIntervalSec });
}
