// Strategy B: read USDT Transfer logs to the receiving address from a BNB Smart Chain RPC node.
import { fromTokenUnits } from '../money.js';

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CHUNK = 2000;
const pad = addr => '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
export async function rpc(url, method, params, fetchImpl = fetch) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message}`);
  return body.result;
}
const hex = n => '0x' + n.toString(16);

export const onchainProvider = {
  type: 'binance_bep20',
  async testConnection(cfg, { fetchImpl = fetch } = {}) {
    try {
      if (!cfg.rpcUrl) return { ok: false, message: 'rpcUrl is not configured' };
      if (!cfg.usdtContract) return { ok: false, message: 'usdtContract is not configured: verify the BEP20 USDT address before go-live' };
      const chain = parseInt(await rpc(cfg.rpcUrl, 'eth_chainId', [], fetchImpl), 16);
      if (chain !== 56) return { ok: false, message: `RPC is on chain ${chain}, expected 56 (BNB Smart Chain)` };
      const code = await rpc(cfg.rpcUrl, 'eth_getCode', [cfg.usdtContract, 'latest'], fetchImpl);
      if (!code || code === '0x') return { ok: false, message: 'No contract at usdtContract on this chain' };
      const dec = parseInt(await rpc(cfg.rpcUrl, 'eth_call', [{ to: cfg.usdtContract, data: '0x313ce567' }, 'latest'], fetchImpl), 16);
      if (dec !== 18) return { ok: false, message: `Token has ${dec} decimals; BEP20 USDT is expected to have 18` };
      return { ok: true, message: 'Connected to BNB Smart Chain; token contract verified (18 decimals).' };
    } catch (e) { return { ok: false, message: e.message }; }
  },
  async fetchEvents(cfg, { cursor = null, fetchImpl = fetch } = {}) {
    if (!cfg.rpcUrl || !cfg.usdtContract || !cfg.receivingAddress) throw new Error('onchain strategy needs rpcUrl, usdtContract and receivingAddress');
    const latest = parseInt(await rpc(cfg.rpcUrl, 'eth_blockNumber', [], fetchImpl), 16);
    const reorgMargin = Number(cfg.requiredConfirmations ?? 15) + 10;
    const from = cursor?.block != null ? Math.max(cursor.block - reorgMargin, latest - 5000) : latest - 1200;   // ~1h on first run
    const events = [], tsCache = new Map();
    for (let start = Math.max(from, 0); start <= latest; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, latest);
      const logs = await rpc(cfg.rpcUrl, 'eth_getLogs', [{ address: cfg.usdtContract, fromBlock: hex(start), toBlock: hex(end),
        topics: [TRANSFER_TOPIC, null, pad(cfg.receivingAddress)] }], fetchImpl);
      for (const l of logs) {
        const bn = parseInt(l.blockNumber, 16);
        if (!tsCache.has(bn)) tsCache.set(bn, parseInt((await rpc(cfg.rpcUrl, 'eth_getBlockByNumber', [l.blockNumber, false], fetchImpl)).timestamp, 16));
        events.push({ txRef: `${l.transactionHash}:${parseInt(l.logIndex, 16)}`, amount: fromTokenUnits(BigInt(l.data), 18), asset: 'USDT', network: 'BSC',
          confirmations: latest - bn + 1, detectedAt: new Date(tsCache.get(bn) * 1000).toISOString(),
          raw: { source: 'onchain', block: bn, from: '0x' + l.topics[1].slice(26) } });
      }
    }
    return { events, cursor: { block: latest } };
  },
};
