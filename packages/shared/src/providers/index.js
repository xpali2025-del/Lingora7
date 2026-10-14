import { binanceProvider } from './binance.js';
import { onchainProvider } from './onchain.js';
import { mockProvider } from './mock.js';
import { decrypt } from '../crypto.js';

/** PaymentProvider interface: { type, testConnection(cfg), fetchEvents(cfg, ctx) -> { events, cursor } }.
 *  PayPal / Payoneer adapters plug in here later (webhook-based: handleWebhook) without touching checkout or orders. */
export function resolveProvider(row) {
  if (row.type === 'mock') return mockProvider;
  if (row.type === 'binance_bep20') return (row.public_config?.strategy === 'onchain') ? onchainProvider : binanceProvider;
  throw new Error(`provider ${row.type} has no adapter yet`);
}
/** public_config + decrypted secrets (secrets never leave the worker process). */
export function loadConfig(row, key32) {
  const secrets = row.config_encrypted ? JSON.parse(decrypt(row.config_encrypted, key32)) : {};
  return { ...(row.public_config || {}), ...secrets };
}
export const requiredConfirmationsFor = row =>
  row.type === 'mock' ? Number(row.public_config?.requiredConfirmations ?? 15)
  : row.public_config?.strategy === 'onchain' ? Number(row.public_config?.requiredConfirmations ?? 15) : 1;
export { binanceProvider, onchainProvider, mockProvider };
