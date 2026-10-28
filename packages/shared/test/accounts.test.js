import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import * as C from '../src/commerce.js';
import * as A from '../src/admin.js';
import * as W from '../src/wallet.js';
import * as U from '../src/customers.js';
import { verifyGoogleIdToken, googleAuthUrl, GoogleAuthError } from '../src/google.js';
import { createEmailSender } from '../src/email/send.js';
import { totp, base32Decode } from '../src/totp.js';
import { makeDb, KEY, SAMPLE_URLS } from './helpers.js';

const stock = async (db, n) => C.importCodes(db, { source: 't', text: Array.from({ length: n }, (_, i) => SAMPLE_URLS(i + 1)).join('\n'), actor: 't', key32: KEY });
const status = async (db, ref) => (await db.query('SELECT status FROM orders WHERE public_ref=$1', [ref])).rows[0].status;

// ---------- schema ----------
test('every public table has row-level security on (Supabase REST cannot read anything)', async () => {
  const db = await makeDb();
  const r = await db.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity`);
  assert.deepEqual(r.rows.map(x => x.relname), []);
});
test('Yemen market is live at the Arab tier price and the internal balance provider exists', async () => {
  const db = await makeDb();
  const m = (await db.query(`SELECT * FROM markets WHERE code='ye'`)).rows[0];
  assert.equal(m.status, 'live'); assert.equal(Number(m.price_usdt), 13);
  assert.equal((await db.query(`SELECT enabled FROM payment_providers WHERE type='balance'`)).rows[0].enabled, true);
  const o = await C.createOrder(db, { marketCode: 'ye' }); assert.equal(o.priceUsdt, '13.00');
});

// ---------- google ----------
const kp = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...kp.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function idToken(claims = {}, { kid = 'k1', priv = kp.privateKey } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: 'https://accounts.google.com', aud: 'cid', sub: '123', email: 'Nasim@Example.com', email_verified: true, nonce: 'n1', exp: now + 600, ...claims };
  const head = b64({ alg: 'RS256', kid }), payload = b64(body);
  return `${head}.${payload}.${createSign('RSA-SHA256').update(`${head}.${payload}`).sign(priv).toString('base64url')}`;
}
const opts = (extra = {}) => ({ clientId: 'cid', nonce: 'n1', keys: [jwk], ...extra });
test('google id_token: valid token yields a lower-cased verified identity', async () => {
  const r = await verifyGoogleIdToken(idToken(), opts());
  assert.equal(r.email, 'nasim@example.com'); assert.equal(r.sub, '123');
});
test('google id_token: wrong audience, issuer, nonce, expiry, unverified e-mail, unknown key and forged signature are all refused', async () => {
  const bad = async (tok, o, code) => await assert.rejects(verifyGoogleIdToken(tok, o), e => e instanceof GoogleAuthError && e.code === code);
  await bad(idToken({ aud: 'other' }), opts(), 'bad_audience');
  await bad(idToken({ iss: 'https://evil.example' }), opts(), 'bad_issuer');
  await bad(idToken({ nonce: 'x' }), opts(), 'bad_nonce');
  await bad(idToken({ exp: 1 }), opts(), 'token_expired');
  await bad(idToken({ email_verified: false }), opts(), 'email_not_verified');
  await bad(idToken({}, { kid: 'zzz' }), opts(), 'unknown_signing_key');
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await bad(idToken({}, { priv: other.privateKey }), opts(), 'bad_signature');
  await bad('not.a.jwt.at.all', opts(), 'bad_id_token');
  const [h, p, s] = idToken().split('.');
  await bad(`${h}.${b64({ ...JSON.parse(Buffer.from(p, 'base64url')), email: 'attacker@example.com' })}.${s}`, opts(), 'bad_signature');
});
test('google auth url asks for openid+email and carries state and nonce', () => {
  const u = new URL(googleAuthUrl({ clientId: 'cid', redirectUri: 'https://x.test/cb', state: 's', nonce: 'n' }));
  assert.equal(u.searchParams.get('scope'), 'openid email profile'); assert.equal(u.searchParams.get('state'), 's'); assert.equal(u.searchParams.get('nonce'), 'n');
});

// ---------- admin sign-in with Google ----------
test('admin google login: existing admin or OWNER_EMAILS only; locked users and strangers are refused', async () => {
  const db = await makeDb();
  await assert.rejects(A.loginGoogle(db, { email: 'stranger@x.co', ownerEmails: ['owner@x.co'] }), { code: 'not_allowed' });
  const { token, role } = await A.loginGoogle(db, { email: 'Owner@X.co', ownerEmails: ['owner@x.co'] });
  assert.equal(role, 'owner'); assert.equal((await A.getSession(db, token)).email, 'owner@x.co');
  await A.runAction(db, await A.getSession(db, token), 'user_create_google', { email: 'helper@x.co', role: 'support' }, { key32: KEY });
  assert.equal((await A.loginGoogle(db, { email: 'helper@x.co' })).role, 'support');
  await db.query(`UPDATE admin_users SET locked_until='2999-01-01' WHERE email='helper@x.co'`);
  await assert.rejects(A.loginGoogle(db, { email: 'helper@x.co' }), { code: 'locked' });
  await assert.rejects(A.loginPassword(db, { email: 'owner@x.co', password: 'anything at all' }), { code: 'invalid_credentials' }, 'a Google-only admin has no password to guess');
});
test('Google-only admin may change the receiving wallet only right after signing in', async () => {
  const db = await makeDb();
  const { token } = await A.loginGoogle(db, { email: 'o@x.co', ownerEmails: ['o@x.co'] });
  const user = await A.getSession(db, token); const id = (await db.query(`SELECT id FROM payment_providers WHERE type='mock'`)).rows[0].id;
  const A1 = '0x' + '2'.repeat(40);
  await A.runAction(db, user, 'provider_save', { id, receivingAddress: A1 }, { key32: KEY });             // first wallet: no confirmation needed
  await A.runAction(db, user, 'provider_save', { id, receivingAddress: '0x' + '3'.repeat(40) }, { key32: KEY });   // fresh session: allowed
  await db.query(`UPDATE admin_sessions SET created_at = now() - interval '1 hour' WHERE token_hash=$1`, [user.token_hash]);
  await assert.rejects(A.runAction(db, user, 'provider_save', { id, receivingAddress: '0x' + '4'.repeat(40) }, { key32: KEY }), { code: 'recent_login_required' });
});

// ---------- customer sign-in ----------
test('magic link works once, expires, and sessions can be ended', async () => {
  const db = await makeDb(); const sender = createEmailSender({ provider: 'log', log: () => {} });
  await U.sendLoginLink(db, sender, { email: 'Buyer@Example.com', siteUrl: 'https://lingora.test', lang: 'ar' });
  assert.equal(sender.sent.length, 1); assert.equal(sender.sent[0].to, 'buyer@example.com');
  const token = new URL(sender.sent[0].text.match(/https:\/\/\S+/)[0]).searchParams.get('t');
  assert.equal(await U.consumeLoginToken(db, token), 'buyer@example.com');
  await assert.rejects(U.consumeLoginToken(db, token), { code: 'invalid_token' }, 'second use is refused');
  const t2 = await U.createLoginToken(db, 'late@example.com');
  await db.query(`UPDATE login_tokens SET expires_at = now() - interval '1 minute'`);
  await assert.rejects(U.consumeLoginToken(db, t2), { code: 'invalid_token' });
  await assert.rejects(U.createLoginToken(db, 'not-an-email'), { code: 'invalid_email' });
  const c = await U.upsertCustomer(db, { email: 'buyer@example.com' });
  const s = await U.createCustomerSession(db, { customerId: c.id });
  assert.equal((await U.getCustomerSession(db, s)).email, 'buyer@example.com');
  await U.destroyCustomerSession(db, s); assert.equal(await U.getCustomerSession(db, s), null);
  assert.equal(await U.getCustomerSession(db, 'garbage'), null);
});

// ---------- wallet ----------
test('wallet: credit, debit, never negative, ledger shows both', async () => {
  const db = await makeDb();
  const r1 = await W.creditWallet(db, { email: 'a@x.co', amount: '20', actor: 'owner' });
  assert.equal(r1.balance, '20.00');
  assert.equal((await W.debitWallet(db, { email: 'a@x.co', amount: '5.5', actor: 'owner' })).balance, '14.50');
  await assert.rejects(W.debitWallet(db, { email: 'a@x.co', amount: '99', actor: 'owner' }), { code: 'insufficient_balance' });
  await assert.rejects(W.creditWallet(db, { email: 'a@x.co', amount: '-3', actor: 'owner' }), { code: 'invalid_amount' });
  await assert.rejects(W.creditWallet(db, { email: 'a@x.co', amount: 'abc', actor: 'owner' }), { code: 'invalid_amount' });
  assert.equal((await W.getWallet(db, r1.customerId)).balance, '14.50');
  const led = await W.listLedger(db, r1.customerId); assert.deepEqual(led.map(l => l.sign + l.amount), ['-5.50', '+20.00']);
  await assert.rejects(db.query('UPDATE wallets SET balance = -1 WHERE customer_id=$1', [r1.customerId]), /check|constraint/i, 'the database itself forbids an overdraft');
});
test('top-up request: owner credits it once; reject leaves the wallet alone; at most 3 open per e-mail', async () => {
  const db = await makeDb();
  const { id } = await W.createTopupRequest(db, { email: 'Yem@X.co', name: 'Ali', contact: '+967700000000', method: 'Kuraimi transfer', amountHint: '13 USD' });
  await assert.rejects(W.createTopupRequest(db, { email: 'bad', contact: '+967700000000', method: 'x' }), { code: 'invalid_email' });
  await assert.rejects(W.createTopupRequest(db, { email: 'y@x.co', contact: '1', method: 'x' }), { code: 'invalid_request' });
  const r = await W.resolveTopup(db, { id, action: 'credit', amount: '13', actor: 'support' });
  assert.equal(r.status, 'credited'); assert.equal(r.balance, '13.00');
  await assert.rejects(W.resolveTopup(db, { id, action: 'credit', amount: '13', actor: 'support' }), { code: 'already_resolved' }, 'cannot be credited twice');
  const { id: id2 } = await W.createTopupRequest(db, { email: 'yem@x.co', contact: '+967700000000', method: 'Jaib' });
  assert.equal((await W.resolveTopup(db, { id: id2, action: 'reject', actor: 'support' })).status, 'rejected');
  assert.equal((await W.getWallet(db, r.customerId)).balance, '13.00');
  for (let i = 0; i < 3; i++) await W.createTopupRequest(db, { email: 'spam@x.co', contact: '+967700000000', method: 'x' });
  await assert.rejects(W.createTopupRequest(db, { email: 'spam@x.co', contact: '+967700000000', method: 'x' }), { code: 'too_many_open_requests' });
});

// ---------- paying from the balance ----------
test('balance purchase (manual mode): debits once, order is ready for the admin, ledger links the order', async () => {
  const db = await makeDb(); await stock(db, 2);
  const { customerId } = await W.creditWallet(db, { email: 'buyer@x.co', amount: '20', actor: 'owner' });
  const o = await C.createOrderFromBalance(db, { customerId, marketCode: 'ye', key32: KEY });
  assert.equal(o.status, 'ready_to_fulfil'); assert.equal(o.balance, '7.00'); assert.equal(o.priceUsdt, '13.00');
  assert.equal(await status(db, o.ref), 'ready_to_fulfil');
  const led = await W.listLedger(db, customerId); assert.equal(led[0].sign + led[0].amount, '-13.00'); assert.equal(led[0].kind, 'purchase');
  assert.equal(await C.getOrderEmail(db, (await db.query('SELECT id FROM orders WHERE public_ref=$1', [o.ref])).rows[0].id, KEY), 'buyer@x.co');
  assert.ok(await C.getOrderForClient(db, o.ref, o.key), 'the order page key works');
  await assert.rejects(C.createOrderFromBalance(db, { customerId, marketCode: 'ye', key32: KEY }), { code: 'insufficient_balance' });
  assert.equal((await W.getWallet(db, customerId)).balance, '7.00', 'a refused purchase does not move money');
});
test('balance purchase (auto mode) allocates a code and queues the delivery e-mail', async () => {
  const db = await makeDb(); await stock(db, 1);
  await C.setSetting(db, 'fulfilment_mode', 'auto');
  const { customerId } = await W.creditWallet(db, { email: 'buyer@x.co', amount: '13', actor: 'owner' });
  const o = await C.createOrderFromBalance(db, { customerId, marketCode: 'ye', key32: KEY });
  const row = (await db.query('SELECT id, code_id FROM orders WHERE public_ref=$1', [o.ref])).rows[0];
  assert.ok(row.code_id, 'code assigned');
  assert.equal((await db.query(`SELECT count(*)::int n FROM email_outbox WHERE order_id=$1 AND template='code_delivered'`, [row.id])).rows[0].n, 1);
  assert.equal((await W.getWallet(db, customerId)).balance, '0.00');
});
test('two simultaneous purchases with money for one: exactly one succeeds', async () => {
  const db = await makeDb(); await stock(db, 5);
  const { customerId } = await W.creditWallet(db, { email: 'buyer@x.co', amount: '13', actor: 'owner' });
  const res = await Promise.allSettled([1, 2, 3].map(() => C.createOrderFromBalance(db, { customerId, marketCode: 'ye', key32: KEY })));
  assert.equal(res.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(res.filter(r => r.status === 'rejected').every(r => r.reason.code === 'insufficient_balance'));
  assert.equal((await db.query(`SELECT count(*)::int n FROM orders WHERE customer_id=$1`, [customerId])).rows[0].n, 1);
});
test('stock guard: no order (USDT or balance) when nothing is left to deliver; stock reopens sales', async () => {
  const db = await makeDb();
  await db.exec(`UPDATE settings SET value='true' WHERE key='block_orders_when_out_of_stock'`);
  await assert.rejects(C.createOrder(db, { marketCode: 'ar-eg' }), { code: 'out_of_stock' });
  const { customerId } = await W.creditWallet(db, { email: 'buyer@x.co', amount: '50', actor: 'owner' });
  await assert.rejects(C.createOrderFromBalance(db, { customerId, marketCode: 'ye', key32: KEY }), { code: 'out_of_stock' });
  assert.equal((await W.getWallet(db, customerId)).balance, '50.00', 'no charge when out of stock');
  await stock(db, 1);
  assert.equal(await C.sellableStock(db), 1);
  await C.createOrder(db, { marketCode: 'ar-eg' });          // an unpaid order does not reserve stock
  const o = await C.createOrderFromBalance(db, { customerId, marketCode: 'ye', key32: KEY });
  assert.equal(o.status, 'ready_to_fulfil');
  assert.equal(await C.sellableStock(db), 0, 'the paid order is waiting for the only code');
  await assert.rejects(C.createOrder(db, { marketCode: 'ar-eg' }), { code: 'out_of_stock' });
});

test('provider settings: free on-chain strategy with a verification node; http endpoints and bad contracts are refused', async () => {
  const db = await makeDb(); const u = { id: 1, email: 'o@x.co', role: 'owner' };
  const id = (await db.query(`SELECT id FROM payment_providers WHERE type='binance_bep20'`)).rows[0].id;
  const ADDR = '0x' + '5'.repeat(40);
  await A.runAction(db, u, 'provider_save', { id, receivingAddress: ADDR, strategy: 'onchain', verifyRpcUrl: 'https://verify.example/rpc', usdtContract: '0x55d398326f99059fF775485246999027B3197955', requiredConfirmations: '15' }, { key32: KEY });
  const cfg = (await db.query('SELECT public_config FROM payment_providers WHERE id=$1', [id])).rows[0].public_config;
  assert.equal(cfg.strategy, 'onchain'); assert.equal(cfg.verifyRpcUrl, 'https://verify.example/rpc'); assert.equal(cfg.network, 'BSC');
  await assert.rejects(A.runAction(db, u, 'provider_save', { id, strategy: 'onchain', verifyRpcUrl: 'http://insecure.example' }, { key32: KEY }), { code: 'bad_input' });
  await assert.rejects(A.runAction(db, u, 'provider_save', { id, strategy: 'onchain', usdtContract: 'not-an-address' }, { key32: KEY }), { code: 'bad_address' });
  await A.runAction(db, u, 'provider_save', { id, strategy: 'onchain', verifyRpcUrl: '' }, { key32: KEY });
  assert.equal((await db.query('SELECT public_config FROM payment_providers WHERE id=$1', [id])).rows[0].public_config.verifyRpcUrl, undefined);
});
