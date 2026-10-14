import test from 'node:test';
import assert from 'node:assert/strict';
import { binanceProvider, onchainProvider, hmacSha256Hex, createEmailSender, renderEmail, LANGS } from '@lingora/shared';
import { TRANSFER_TOPIC as TT } from '../../../packages/shared/src/providers/onchain.js';

const ADDR = '0xAbCdEf0000000000000000000000000000000001';
const jsonRes = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('binance: request is signed with HMAC-SHA256 over the exact query string and sends the API key header', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return jsonRes([]); };
  await binanceProvider.fetchEvents({ apiKey: 'KEY', apiSecret: 'SECRET', receivingAddress: ADDR }, { fetchImpl, now: 1_700_000_000_000 });
  const u = new URL(seen.url);
  assert.equal(u.pathname, '/sapi/v1/capital/deposit/hisrec');
  const sig = u.searchParams.get('signature'); u.searchParams.delete('signature');
  assert.equal(sig, hmacSha256Hex('SECRET', u.searchParams.toString()));
  assert.equal(seen.init.headers['X-MBX-APIKEY'], 'KEY');
  assert.equal(u.searchParams.get('coin'), 'USDT'); assert.equal(u.searchParams.get('timestamp'), '1700000000000');
});
test('binance: only credited USDT on BSC to OUR address become events; pending has 0 confirmations', async () => {
  const rows = [
    { id: 1, coin: 'USDT', network: 'BSC', address: ADDR.toLowerCase(), amount: '13.0042', status: 1, txId: '0xa', insertTime: 1_700_000_100_000 },
    { id: 2, coin: 'USDT', network: 'BSC', address: ADDR, amount: '15.0017', status: 0, txId: '0xb', insertTime: 1_700_000_200_000 },
    { id: 3, coin: 'USDT', network: 'ETH', address: ADDR, amount: '13.0001', status: 1, txId: '0xc', insertTime: 1_700_000_300_000 },
    { id: 4, coin: 'USDT', network: 'BSC', address: '0xSomeoneElse', amount: '13.0002', status: 1, txId: '0xd', insertTime: 1_700_000_400_000 },
    { id: 5, coin: 'BNB', network: 'BSC', address: ADDR, amount: '1', status: 1, txId: '0xe', insertTime: 1_700_000_500_000 },
    { id: 6, coin: 'USDT', network: 'BSC', address: ADDR, amount: '13.0099', status: 6, txId: '0xf', insertTime: 1_700_000_600_000 },
  ];
  const r = await binanceProvider.fetchEvents({ apiKey: 'k', apiSecret: 's', receivingAddress: ADDR }, { fetchImpl: async () => jsonRes(rows), now: 1_700_001_000_000 });
  assert.deepEqual(r.events.map(e => e.txRef), ['0xa', '0xb', '0xf']);
  assert.equal(r.events[0].confirmations > 0, true); assert.equal(r.events[1].confirmations, 0);
  assert.equal(r.events[0].amount, '13.0042'); assert.equal(r.cursor.sinceMs, 1_700_000_600_000);
});
test('binance: testConnection rejects withdrawal-enabled keys and unreadable keys, warns when not IP-restricted', async () => {
  const mk = body => ({ fetchImpl: async () => jsonRes(body) });
  const cfg = { apiKey: 'k', apiSecret: 's' };
  assert.equal((await binanceProvider.testConnection(cfg, mk({ enableReading: true, enableWithdrawals: true, ipRestrict: true }))).ok, false);
  assert.equal((await binanceProvider.testConnection(cfg, mk({ enableReading: false, enableWithdrawals: false }))).ok, false);
  const warn = await binanceProvider.testConnection(cfg, mk({ enableReading: true, enableWithdrawals: false, ipRestrict: false }));
  assert.equal(warn.ok, true); assert.equal(warn.warnings.length, 1);
  assert.equal((await binanceProvider.testConnection(cfg, { fetchImpl: async () => jsonRes({ msg: 'Invalid API-key' }, false, 401) })).ok, false);
  assert.equal((await binanceProvider.testConnection({}, {})).ok, false);   // missing credentials
});

// ---- on-chain strategy against a fake BSC node ----
function fakeNode({ latest = 1000, logs = [], chain = 56, decimals = 18, code = '0x6080' } = {}) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const { method, params } = JSON.parse(init.body); calls.push({ method, params });
    const ok = result => jsonRes({ jsonrpc: '2.0', id: 1, result });
    switch (method) {
      case 'eth_blockNumber': return ok('0x' + latest.toString(16));
      case 'eth_chainId': return ok('0x' + chain.toString(16));
      case 'eth_getCode': return ok(code);
      case 'eth_call': return ok('0x' + decimals.toString(16).padStart(64, '0'));
      case 'eth_getBlockByNumber': return ok({ timestamp: '0x' + (1_700_000_000 + parseInt(params[0], 16)).toString(16) });
      case 'eth_getLogs': { const { fromBlock, toBlock } = params[0]; return ok(logs.filter(l => parseInt(l.blockNumber, 16) >= parseInt(fromBlock, 16) && parseInt(l.blockNumber, 16) <= parseInt(toBlock, 16))); }
      default: return jsonRes({ error: { message: 'unsupported ' + method } });
    }
  };
  return { fetchImpl, calls };
}
const log = (block, tx, idx, amountWei, from = '0x' + 'ab'.repeat(20)) => ({ blockNumber: '0x' + block.toString(16), transactionHash: tx, logIndex: '0x' + idx.toString(16),
  data: '0x' + BigInt(amountWei).toString(16).padStart(64, '0'), topics: [TT, '0x' + from.slice(2).padStart(64, '0'), '0x' + ADDR.slice(2).toLowerCase().padStart(64, '0')] });
const CFG = { rpcUrl: 'http://node', usdtContract: '0x55d398326f99059fF775485246999027B3197955', receivingAddress: ADDR, requiredConfirmations: 15 };

test('onchain: Transfer topic constant is the ERC-20 Transfer signature', () => assert.equal(TT, '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'));
test('onchain: parses logs into exact decimal amounts, confirmations and block timestamps; filters by address topic', async () => {
  const node = fakeNode({ latest: 1000, logs: [log(990, '0xaaa', 3, '13004200000000000000'), log(999, '0xbbb', 0, '15001700000000000000')] });
  const r = await onchainProvider.fetchEvents(CFG, { fetchImpl: node.fetchImpl });
  assert.deepEqual(r.events.map(e => [e.txRef, e.amount, e.confirmations]), [['0xaaa:3', '13.0042', 11], ['0xbbb:0', '15.0017', 2]]);
  assert.equal(r.events[0].detectedAt, new Date((1_700_000_000 + 990) * 1000).toISOString());
  assert.equal(r.cursor.block, 1000);
  const getLogs = node.calls.find(c => c.method === 'eth_getLogs').params[0];
  assert.equal(getLogs.address, CFG.usdtContract); assert.equal(getLogs.topics[0], TT);
  assert.equal(getLogs.topics[2], '0x' + ADDR.slice(2).toLowerCase().padStart(64, '0'));
});
test('onchain: rescans with a reorg margin from the cursor and chunks large ranges', async () => {
  const node = fakeNode({ latest: 10_000 });
  await onchainProvider.fetchEvents(CFG, { cursor: { block: 3_000 }, fetchImpl: node.fetchImpl });
  const reqs = node.calls.filter(c => c.method === 'eth_getLogs').map(c => [parseInt(c.params[0].fromBlock, 16), parseInt(c.params[0].toBlock, 16)]);
  assert.equal(reqs[0][0], 10_000 - 5000);                       // capped to the last 5000 blocks
  assert.ok(reqs.every(([a, b]) => b - a < 2000)); assert.equal(reqs.at(-1)[1], 10_000);
});
test('onchain: testConnection checks chain id 56, contract code and 18 decimals; refuses a missing contract address', async () => {
  assert.equal((await onchainProvider.testConnection(CFG, fakeNode())).ok, true);
  assert.equal((await onchainProvider.testConnection(CFG, fakeNode({ chain: 1 }))).ok, false);
  assert.equal((await onchainProvider.testConnection(CFG, fakeNode({ decimals: 6 }))).ok, false);
  assert.equal((await onchainProvider.testConnection(CFG, fakeNode({ code: '0x' }))).ok, false);
  const r = await onchainProvider.testConnection({ ...CFG, usdtContract: '' }, fakeNode());
  assert.equal(r.ok, false); assert.match(r.message, /verify/);
});

// ---- email ----
test('templates exist for all 8 languages, escape HTML, carry no tracking pixel and set RTL for Arabic', () => {
  for (const l of LANGS) for (const t of ['code_delivered', 'review_invitation', 'order_received', 'refund_approved', 'refund_rejected']) {
    const m = renderEmail(t, l, { ref: 'LG-X', redeemUrl: 'https://d.test/r?a=1&b=<2>', reviewUrl: 'https://l.test/r', supportEmail: 's@l.test' });
    assert.ok(m.subject.includes('LG-X')); assert.ok(!/<img|tracking|pixel/i.test(m.html));
    if (t === 'code_delivered') { assert.ok(m.text.includes('https://d.test/r?a=1&b=<2>')); assert.ok(m.html.includes('&lt;2&gt;')); assert.ok(!m.html.includes('<2>')); }
  }
  assert.equal(renderEmail('code_delivered', 'ar', { ref: 'x', redeemUrl: 'https://a.b' }).dir, 'rtl');
  assert.equal(renderEmail('code_delivered', 'de', { ref: 'x', redeemUrl: 'https://a.b' }).dir, 'ltr');
  assert.match(renderEmail('code_delivered', 'xx', { ref: 'x', redeemUrl: 'https://a.b' }).subject, /Your Duolingo Super link/);   // unknown language falls back to English
  assert.match(renderEmail('code_delivered', 'en', { ref: 'x', redeemUrl: 'https://a.b' }, { intro: 'Custom intro' }).text, /Custom intro/);   // admin override
});
test('email senders: resend and postmark payloads, errors surface', async () => {
  let req;
  const f = async (url, init) => { req = { url, init, body: JSON.parse(init.body) }; return jsonRes({ id: 'r1', MessageID: 'p1' }); };
  const r = await createEmailSender({ provider: 'resend', apiKey: 'k', from: 'a@b.c', fetchImpl: f }).send({ to: 'x@y.z', subject: 's', html: '<p>h</p>', text: 't' });
  assert.equal(r.id, 'r1'); assert.equal(req.init.headers.Authorization, 'Bearer k'); assert.deepEqual(req.body.to, ['x@y.z']);
  const p = await createEmailSender({ provider: 'postmark', apiKey: 'k', from: 'a@b.c', fetchImpl: f }).send({ to: 'x@y.z', subject: 's', html: 'h', text: 't' });
  assert.equal(p.id, 'p1'); assert.equal(req.body.TrackOpens, false); assert.equal(req.body.TrackLinks, 'None');
  await assert.rejects(createEmailSender({ provider: 'resend', apiKey: 'k', fetchImpl: async () => jsonRes({ message: 'bad' }, false, 422) }).send({ to: 'a', subject: 's', html: '', text: '' }), /resend 422/);
  assert.throws(() => createEmailSender({ provider: 'resend', apiKey: '' }), /EMAIL_API_KEY/);
});
