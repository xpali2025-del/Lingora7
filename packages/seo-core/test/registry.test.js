import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePage, lookup, validateEntry } from '../src/registry.js';

const good = { key: 'k', market: '*', value: 'V', source_url: 'https://example.com', verified_at: '2026-10-01', expires_at: '2027-01-01' };
const T = '2026-10-14';

test('resolves {{fact:k}} and {{k}}', () => {
  const r = resolvePage({ text: 'a {{fact:k}} b {{k}}', locale: 'ar-EG' }, [good], T);
  assert.equal(r.text, 'a V b V'); assert.ok(r.ready);
});
test('missing fact blocks and keeps placeholder', () => {
  const r = resolvePage({ text: 'x {{nope}}', locale: 'ar' }, [good], T);
  assert.equal(r.ready, false); assert.equal(r.problems[0].problem, 'missing'); assert.match(r.text, /\{\{nope\}\}/);
});
test('expired, no-source and empty facts are rejected', () => {
  assert.match(validateEntry({ ...good, expires_at: '2026-10-01' }, T).problem, /expired/);
  assert.equal(validateEntry({ ...good, source_url: '' }, T).problem, 'no source_url');
  assert.equal(validateEntry({ ...good, value: ' ' }, T).problem, 'empty value');
  assert.equal(validateEntry({ ...good, verified_at: '' }, T).problem, 'no verified_at');
});
test('market-specific beats language beats global', () => {
  const reg = [{ ...good, market: '*', value: 'G' }, { ...good, market: 'ar', value: 'L' }, { ...good, market: 'ar-EG', value: 'M' }];
  assert.equal(lookup(reg, 'k', 'ar-EG').value, 'M');
  assert.equal(lookup(reg, 'k', 'ar-SA').value, 'L');
  assert.equal(lookup(reg, 'k', 'en-GB').value, 'G');
});
test('a market fact never leaks into another market', () => {
  assert.equal(lookup([{ ...good, market: 'ar-EG' }], 'k', 'ar-SA'), undefined);
});
test('leftover [VERIFY] marker blocks even when all facts resolve', () => {
  const r = resolvePage({ text: '{{k}} [VERIFY]', locale: 'en' }, [good], T);
  assert.equal(r.ready, false); assert.equal(r.verifyLeft, 1);
});
