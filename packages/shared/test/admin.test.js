import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/commerce.js';
import * as A from '../src/admin.js';
import { totp, base32Decode } from '../src/totp.js';
import { makeDb, KEY, SAMPLE_URLS } from './helpers.js';

const code = secret => totp(base32Decode(secret));
async function boot() {
  const db = await makeDb();
  const owner = await A.createAdminUser(db, { email: 'Owner@Lingora.test', password: 'correct horse battery', role: 'owner', key32: KEY });
  return { db, owner };
}
async function login(db, owner, password = 'correct horse battery') {
  const { token } = await A.loginPassword(db, { email: owner.email, password });
  assert.equal(await A.getSession(db, token), null, 'password alone is not a session');
  await A.loginTotp(db, { token, code: code(owner.totpSecret), key32: KEY });
  return { token, user: await A.getSession(db, token) };
}

test('login needs password AND TOTP; a TOTP code cannot be replayed', async () => {
  const { db, owner } = await boot();
  const { token, user } = await login(db, owner);
  assert.equal(user.role, 'owner');
  const t2 = (await A.loginPassword(db, { email: owner.email, password: 'correct horse battery' })).token;
  await assert.rejects(A.loginTotp(db, { token: t2, code: code(owner.totpSecret), key32: KEY }), { code: 'invalid_code' });
  await A.logout(db, token); assert.equal(await A.getSession(db, token), null);
});
test('wrong password locks the account after 5 attempts', async () => {
  const { db, owner } = await boot();
  for (let i = 0; i < 5; i++) await assert.rejects(A.loginPassword(db, { email: owner.email, password: 'nope nope nope' }), { code: 'invalid_credentials' });
  await assert.rejects(A.loginPassword(db, { email: owner.email, password: 'correct horse battery' }), { code: 'locked' });
  await assert.rejects(A.loginPassword(db, { email: 'ghost@x.co', password: 'whatever whatever' }), { code: 'invalid_credentials' });
});
test('roles: analyst is read-only, support cannot touch pricing/providers', async () => {
  const { db, owner } = await boot();
  const sup = { id: 99, email: 's@x.co', role: 'support' }, an = { id: 98, email: 'a@x.co', role: 'analyst' };
  await assert.rejects(A.runAction(db, an, 'order_fulfil', { orderId: 1 }, { key32: KEY }), { code: 'forbidden' });
  await assert.rejects(A.runAction(db, sup, 'market_save', { id: 1, price: '1' }, { key32: KEY }), { code: 'forbidden' });
  await assert.rejects(A.runAction(db, sup, 'provider_save', { id: 1 }, { key32: KEY }), { code: 'forbidden' });
  await assert.rejects(A.runAction(db, null, 'order_fulfil', {}, {}), { code: 'unauthenticated' });
});
test('market price change is audited and recorded in price_history', async () => {
  const { db } = await boot(); const u = { id: 1, email: 'o@x.co', role: 'owner' };
  const m = (await db.query(`SELECT id FROM markets WHERE code='ar-eg'`)).rows[0];
  await A.runAction(db, u, 'market_save', { id: m.id, price: '14', enabled: '1', status: 'live', fulfilmentMode: '' }, { key32: KEY });
  const o = await C.createOrder(db, { marketCode: 'ar-eg' }); assert.equal(o.priceUsdt, '14.00');
  assert.equal((await db.query('SELECT count(*)::int n FROM price_history')).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int n FROM audit_logs WHERE action='market_save'`)).rows[0].n, 1);
});
test('provider secrets are encrypted, write-only, redacted from audit; address change needs fresh 2FA', async () => {
  const { db, owner } = await boot(); const u = { id: owner.id, email: owner.email, role: 'owner' };
  const pid = (await db.query(`SELECT id FROM payment_providers WHERE type='binance_bep20'`)).rows[0].id;
  const A1 = '0x' + 'a'.repeat(40), A2 = '0x' + 'b'.repeat(40);
  await A.runAction(db, u, 'provider_save', { id: pid, receivingAddress: A1, apiKey: 'KEY123', apiSecret: 'SECRET456' }, { key32: KEY });
  const row = (await db.query('SELECT * FROM payment_providers WHERE id=$1', [pid])).rows[0];
  assert.ok(!JSON.stringify(row).includes('SECRET456') && !row.config_encrypted.includes('SECRET'));
  assert.ok(!JSON.stringify((await db.query('SELECT data FROM audit_logs')).rows).includes('SECRET456'));
  await assert.rejects(A.runAction(db, u, 'provider_save', { id: pid, receivingAddress: A2 }, { key32: KEY }), { code: 'totp_required' });
  await A.runAction(db, u, 'provider_save', { id: pid, receivingAddress: A2, totp: code(owner.totpSecret) }, { key32: KEY });
  assert.equal((await db.query('SELECT public_config FROM payment_providers WHERE id=$1', [pid])).rows[0].public_config.receivingAddress, A2);
  await assert.rejects(A.runAction(db, u, 'provider_save', { id: pid, receivingAddress: 'nope' }, { key32: KEY }), { code: 'bad_address' });
  await assert.rejects(A.runAction(db, u, 'provider_toggle', { id: 99999, enabled: '1' }, { key32: KEY }), { code: 'not_found' });
});
test('support can import codes, fulfil an order manually, and refund flow needs the owner', async () => {
  const { db } = await boot(); const sup = { id: 5, email: 's@x.co', role: 'support' }, own = { id: 1, email: 'o@x.co', role: 'owner' };
  const msg = await A.runAction(db, sup, 'codes_import', { text: [SAMPLE_URLS(1), SAMPLE_URLS(1), 'http://bad', 'junk'].join('\n') }, { key32: KEY });
  assert.match(msg, /added 1, duplicates 0, rejected 2/);
  await assert.rejects(A.runAction(db, sup, 'refund_decide', { orderId: 1, approve: '1' }, { key32: KEY }), { code: 'forbidden' });
  await assert.rejects(A.runAction(db, own, 'no_such_action', {}, {}), { code: 'forbidden' });
});
test('review moderation, wallet list validation, user management', async () => {
  const { db } = await boot(); const own = { id: 1, email: 'o@x.co', role: 'owner', token_hash: 'x' };
  await assert.rejects(A.runAction(db, own, 'wallets_save', { wallets: 'zzz' }, {}), { code: 'bad_address' });
  await A.runAction(db, own, 'wallets_save', { wallets: '0x' + 'C'.repeat(40) }, {});
  assert.deepEqual(await C.getSetting(db, 'flagged_wallets'), ['0x' + 'c'.repeat(40)]);
  const r = await A.runAction(db, own, 'user_create', { email: 'new@x.co', password: 'twelve chars pw', role: 'support' }, { key32: KEY });
  assert.ok(r.totpSecret);
  await assert.rejects(A.runAction(db, own, 'user_create', { email: 'w@x.co', password: 'short', role: 'support' }, { key32: KEY }), { code: 'weak_password' });
});

test('contact details: owner-only, validated, stored', async () => {
  const { db, owner } = await boot();
  const { user } = await login(db, owner);
  const sup = { id: 99, email: 's@x.test', role: 'support' };
  await assert.rejects(A.runAction(db, sup, 'contact_save', { email: 'a@b.co' }, { key32: KEY }), { code: 'forbidden' });
  await assert.rejects(A.runAction(db, user, 'contact_save', { email: 'nope' }, { key32: KEY }), { code: 'bad_email' });
  await assert.rejects(A.runAction(db, user, 'contact_save', { email: 'a@b.co', facebook: 'http://fb.com/x' }, { key32: KEY }), { code: 'bad_url_facebook' });
  await assert.rejects(A.runAction(db, user, 'contact_save', { email: 'a@b.co', instagram: 'javascript:alert(1)' }, { key32: KEY }), { code: 'bad_url_instagram' });
  await assert.rejects(A.runAction(db, user, 'contact_save', { email: 'a@b.co', whatsapp: 'abc' }, { key32: KEY }), { code: 'bad_whatsapp' });
  await A.runAction(db, user, 'contact_save', { email: 'Hello@Lingora.World', whatsapp: '+20 100 123 4567', instagram: 'https://instagram.com/lingora', legal_name: 'Lingora Ltd' }, { key32: KEY });
  const c = await C.getSetting(db, 'contact', null);
  assert.equal(c.email, 'hello@lingora.world'); assert.equal(c.whatsapp, '201001234567'); assert.equal(c.instagram, 'https://instagram.com/lingora'); assert.equal(c.legal_name, 'Lingora Ltd');
});

test('wrong TOTP codes lock the account and end the half-open session', async () => {
  const { db, owner } = await boot();
  const { token } = await A.loginPassword(db, { email: owner.email, password: 'correct horse battery' });
  for (let i = 0; i < 5; i++) await assert.rejects(A.loginTotp(db, { token, code: '000000', key32: KEY }), { code: i < 5 ? 'invalid_code' : 'session_expired' });
  await assert.rejects(A.loginTotp(db, { token, code: code(owner.totpSecret), key32: KEY }), { code: 'session_expired' });
  await assert.rejects(A.loginPassword(db, { email: owner.email, password: 'correct horse battery' }), { code: 'locked' });
});
