// Strategy A: read the Binance deposit history for USDT on BSC (BEP20) with a READ-ONLY, IP-restricted API key.
import { hmacSha256Hex } from '../crypto.js';

export const BINANCE_BASE = 'https://api.binance.com';
const CREDITED = new Set([1, 6]);   // 1 = success, 6 = credited (cannot withdraw yet)

export async function signedGet(cfg, path, params = {}, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!cfg.apiKey || !cfg.apiSecret) throw new Error('Binance API key/secret not configured');
  const query = new URLSearchParams({ ...params, recvWindow: '10000', timestamp: String(now) }).toString();
  const signature = hmacSha256Hex(cfg.apiSecret, query);
  const res = await fetchImpl(`${cfg.baseUrl || BINANCE_BASE}${path}?${query}&signature=${signature}`, { headers: { 'X-MBX-APIKEY': cfg.apiKey } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Binance ${res.status}: ${body.msg || 'request failed'}`);
  return body;
}

export const binanceProvider = {
  type: 'binance_bep20',
  configSchema: {
    public: { receivingAddress: 'string (0x…, BEP20 deposit address)', network: 'BSC', asset: 'USDT', strategy: 'binance_api | onchain',
              orderExpiryMinutes: 'number', uniqueDecimalRange: '[0.0001, 0.0099]', requiredConfirmations: 'number', pollSeconds: 'number' },
    secret: { apiKey: 'string', apiSecret: 'string' },
  },
  /** The key must be able to READ and must NOT be able to withdraw. */
  async testConnection(cfg, opts = {}) {
    try {
      const r = await signedGet(cfg, '/sapi/v1/account/apiRestrictions', {}, opts);
      if (!r.enableReading) return { ok: false, message: 'API key cannot read: enable "Enable Reading".' };
      if (r.enableWithdrawals) return { ok: false, message: 'Unsafe key: withdrawals are enabled. Create a read-only key.' };
      const warnings = [];
      if (!r.ipRestrict) warnings.push('Key is not IP-restricted; restrict it to the worker IP.');
      return { ok: true, message: warnings.length ? 'Connected. ' + warnings.join(' ') : 'Connected: read-only and IP-restricted.', warnings };
    } catch (e) { return { ok: false, message: e.message }; }
  },
  /** Returns { events, cursor }. Re-reading an overlapping window is safe: payments are idempotent on tx id. */
  async fetchEvents(cfg, { cursor = null, fetchImpl = fetch, now = Date.now() } = {}) {
    const since = Math.max((cursor?.sinceMs ?? now - 2 * 3600e3) - 10 * 60e3, now - 89 * 86400e3);
    const rows = await signedGet(cfg, '/sapi/v1/capital/deposit/hisrec', { coin: 'USDT', startTime: String(since), endTime: String(now), limit: '1000' }, { fetchImpl, now });
    const want = String(cfg.receivingAddress || '').toLowerCase();
    const events = [];
    let newest = cursor?.sinceMs ?? 0;
    for (const d of Array.isArray(rows) ? rows : []) {
      if (d.coin !== 'USDT') continue;
      const internal = d.transferType === 1;                      // Binance-to-Binance transfer
      if (!internal && String(d.network).toUpperCase() !== 'BSC') continue;
      if (!internal && String(d.address || '').toLowerCase() !== want) continue;
      const credited = CREDITED.has(Number(d.status));
      events.push({ txRef: d.txId || `binance:${d.id}`, amount: String(d.amount), asset: 'USDT', network: 'BSC',
                    confirmations: credited ? 1000 : 0, detectedAt: new Date(Number(d.insertTime)).toISOString(),
                    raw: { source: 'binance_api', status: d.status, internal } });
      newest = Math.max(newest, Number(d.insertTime));
    }
    return { events, cursor: { sinceMs: Math.max(newest, cursor?.sinceMs ?? 0) || now - 3600e3 } };
  },
};
