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
// Free public BNB Smart Chain nodes. A single node is trusted blindly, so a second, independent node (verifyRpcUrl) can confirm every payment.
export const DEFAULT_RPC = 'https://bsc-rpc.publicnode.com';
const rpcUrlOf = cfg => cfg.rpcUrl || process.env.BSC_RPC_URL || DEFAULT_RPC;
const verifyUrlOf = cfg => cfg.verifyRpcUrl || process.env.BSC_VERIFY_RPC_URL || null;
/** Every accepted payment must also exist, with identical contents, on an independent node. A disagreement stops the scan (nothing is credited). */
async function crossCheck(cfg, ev, fetchImpl) {
  const url = verifyUrlOf(cfg); if (!url) return;
  const [tx, idx] = ev.txRef.split(':'), want = ev.raw.log;
  const rc = await rpc(url, 'eth_getTransactionReceipt', [tx], fetchImpl);
  const same = rc && rc.status === '0x1' && (rc.logs || []).some(l => String(l.address).toLowerCase() === String(cfg.usdtContract).toLowerCase() && parseInt(l.logIndex, 16) === Number(idx)
    && l.data === want.data && l.topics?.[0] === want.topics[0] && l.topics?.[2] === want.topics[2]);
  if (!same) throw new Error(`RPC nodes disagree about ${ev.txRef}: not confirmed by the verification node`);
}

export const onchainProvider = {
  type: 'binance_bep20',
  async testConnection(cfg, { fetchImpl = fetch } = {}) {
    try {
      if (!cfg.usdtContract) return { ok: false, message: 'usdtContract is not configured: verify the BEP20 USDT address before go-live' };
      const urls = [rpcUrlOf(cfg), verifyUrlOf(cfg)].filter(Boolean);
      for (const u of urls) {
        const chain = parseInt(await rpc(u, 'eth_chainId', [], fetchImpl), 16);
        if (chain !== 56) return { ok: false, message: `RPC ${u} is on chain ${chain}, expected 56 (BNB Smart Chain)` };
      }
      const code = await rpc(rpcUrlOf(cfg), 'eth_getCode', [cfg.usdtContract, 'latest'], fetchImpl);
      if (!code || code === '0x') return { ok: false, message: 'No contract at usdtContract on this chain' };
      const dec = parseInt(await rpc(rpcUrlOf(cfg), 'eth_call', [{ to: cfg.usdtContract, data: '0x313ce567' }, 'latest'], fetchImpl), 16);
      if (dec !== 18) return { ok: false, message: `Token has ${dec} decimals; BEP20 USDT is expected to have 18` };
      return { ok: true, message: `Connected to BNB Smart Chain; token contract verified (18 decimals).${urls.length > 1 ? ' Verification node OK.' : ' Tip: set a second, independent verification node.'}` };
    } catch (e) { return { ok: false, message: e.message }; }
  },
  async fetchEvents(cfg, { cursor = null, fetchImpl = fetch } = {}) {
    if (!cfg.usdtContract || !cfg.receivingAddress) throw new Error('onchain strategy needs usdtContract and receivingAddress');
    const RPC = rpcUrlOf(cfg);
    const latest = parseInt(await rpc(RPC, 'eth_blockNumber', [], fetchImpl), 16);
    const reorgMargin = Number(cfg.requiredConfirmations ?? 15) + 10;
    // Resume from the cursor (minus a reorg margin) no matter how long nobody ticked: free schedulers can be an hour late.
    // One pass scans at most maxScanBlocks; the cursor only advances to what was really scanned, so a long gap is caught up over the next ticks.
    const from = Math.max(cursor?.block != null ? cursor.block - reorgMargin : latest - 4000, 0);   // first run: the last ~30-60 minutes
    const to = Math.min(latest, from + Number(cfg.maxScanBlocks ?? 40000));
    const events = [], tsCache = new Map();
    for (let start = from; start <= to; start += CHUNK) {
      const end = Math.min(start + CHUNK - 1, to);
      const logs = await rpc(RPC, 'eth_getLogs', [{ address: cfg.usdtContract, fromBlock: hex(start), toBlock: hex(end),
        topics: [TRANSFER_TOPIC, null, pad(cfg.receivingAddress)] }], fetchImpl);
      for (const l of logs) {
        const bn = parseInt(l.blockNumber, 16);
        if (!tsCache.has(bn)) tsCache.set(bn, parseInt((await rpc(RPC, 'eth_getBlockByNumber', [l.blockNumber, false], fetchImpl)).timestamp, 16));
        events.push({ txRef: `${l.transactionHash}:${parseInt(l.logIndex, 16)}`, amount: fromTokenUnits(BigInt(l.data), 18), asset: 'USDT', network: 'BSC',
          confirmations: latest - bn + 1, detectedAt: new Date(tsCache.get(bn) * 1000).toISOString(),
          raw: { source: 'onchain', block: bn, from: '0x' + l.topics[1].slice(26), log: { data: l.data, topics: l.topics } } });
      }
    }
    for (const ev of events) await crossCheck(cfg, ev, fetchImpl);
    return { events, cursor: { block: to } };
  },
};
