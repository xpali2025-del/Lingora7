import test from 'node:test';
import assert from 'node:assert/strict';
import { extractClientIp, isSameOrigin, publicUrl } from '../src/http.js';
const h = o => k => o[k];
test('XFF: the client-prepended (spoofed) entries are ignored; last trusted hop wins', () => {
  assert.equal(extractClientIp(h({ 'x-forwarded-for': '6.6.6.6, 9.9.9.9' }), { NODE_ENV: 'production' }), '9.9.9.9');
  assert.equal(extractClientIp(h({ 'x-forwarded-for': '6.6.6.6, 1.1.1.1, 9.9.9.9' }), { NODE_ENV: 'production', TRUSTED_PROXY_HOPS: '2' }), '1.1.1.1');
});
test('dedicated header wins; missing header fails closed in production, not in dev', () => {
  assert.equal(extractClientIp(h({ 'cf-connecting-ip': '2.2.2.2', 'x-forwarded-for': '6.6.6.6' }), { CLIENT_IP_HEADER: 'CF-Connecting-IP' }), '2.2.2.2');
  assert.equal(extractClientIp(h({}), { NODE_ENV: 'production' }), 'unknown');
  assert.equal(extractClientIp(h({}), { CLIENT_IP_HEADER: 'cf-connecting-ip', NODE_ENV: 'production' }), 'unknown');
  assert.equal(extractClientIp(h({}), {}), '127.0.0.1');
});
test('origin check uses the public host, ignores a rewritten Host header in production', () => {
  const p = { siteUrl: 'https://lingora.world', hostHeader: 'internal:3000', env: { NODE_ENV: 'production' } };
  assert.equal(isSameOrigin('https://lingora.world', p), true);
  assert.equal(isSameOrigin('https://evil.example', p), false);
  assert.equal(isSameOrigin('https://internal:3000', p), false);
  assert.equal(isSameOrigin(null, p), false);
  assert.equal(isSameOrigin('http://localhost:3000', { siteUrl: 'https://lingora.world', hostHeader: 'localhost:3000', env: {} }), true);
});
test('redirects are built on the public origin in production', () => {
  assert.equal(publicUrl('/admin/', { siteUrl: 'https://lingora.world', requestUrl: 'http://internal:3000/x', env: { NODE_ENV: 'production' } }).href, 'https://lingora.world/admin/');
});

import { sslOptions } from '../src/db.js';
test('db ssl: off by default, verified with a CA when asked, no-verify only when explicitly chosen', () => {
  assert.equal(sslOptions({}), undefined);
  assert.deepEqual(sslOptions({ DB_SSL: 'require' }), { rejectUnauthorized: true });
  assert.deepEqual(sslOptions({ DB_SSL: 'require', DB_SSL_CA: 'LINE1\\nLINE2' }), { ca: 'LINE1\nLINE2', rejectUnauthorized: true });
  assert.deepEqual(sslOptions({ DB_SSL: 'no-verify' }), { rejectUnauthorized: false });
});
