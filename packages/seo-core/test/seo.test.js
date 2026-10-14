import test from 'node:test';
import assert from 'node:assert/strict';
import { hreflangFor, sitemapFor, productJsonLd, canonicalFor } from '../src/seo.js';
import { normalise, checkPair, containment } from '../src/similarity.js';
import { MARKETS } from '../src/markets.js';

const pages = [
  { id: 1, hreflangGroup: 'home', locale: 'en', slug: '', lastmod: '2026-10-14' },
  { id: 2, hreflangGroup: 'home', locale: 'ar', slug: '', lastmod: '2026-10-14' },
  { id: 3, hreflangGroup: 'market-eg', locale: 'ar-eg', slug: '', lastmod: '2026-10-14' },
  { id: 4, hreflangGroup: 'home', locale: 'id-id', slug: '', lastmod: '2026-10-14' }, // draft market
];

test('hreflang is reciprocal, self-referencing, includes x-default', () => {
  const a = hreflangFor(pages[0], pages), b = hreflangFor(pages[1], pages);
  assert.deepEqual(a.map(x => x.hreflang).sort(), ['ar', 'en', 'x-default']);
  assert.deepEqual(a, b);
});
test('no equivalents -> no alternates', () => assert.deepEqual(hreflangFor(pages[2], pages), []));
test('draft markets never appear in alternates', () =>
  assert.ok(!hreflangFor(pages[0], pages).some(l => l.hreflang === 'id-ID')));
test('sitemap has loc, lastmod, alternates', () => {
  const x = sitemapFor('en', pages, pages);
  assert.match(x, /<loc>https:\/\/lingora\.world\/en\/<\/loc>/);
  assert.match(x, /hreflang="x-default"/);
});
test('canonical is absolute and self-referencing', () =>
  assert.equal(canonicalFor(pages[2]), 'https://lingora.world/ar-eg/'));
test('Offer markup uses ISO currency USD, price matches tier', () => {
  const eg = MARKETS.find(m => m.code === 'ar-eg'), uk = MARKETS.find(m => m.code === 'en-gb');
  assert.equal(productJsonLd(eg, { name: 'x', description: 'y' }).offers.price, '13');
  assert.equal(productJsonLd(uk, { name: 'x', description: 'y' }).offers.price, '15');
  assert.equal(productJsonLd(eg, { name: 'x', description: 'y' }).offers.priceCurrency, 'USD');
});
test('Arabic normalisation unifies alef/ya/ta-marbuta and strips diacritics', () => {
  assert.equal(normalise('إِشْتِرَاك'), normalise('اشتراك'));
  assert.equal(normalise('مدرسة'), normalise('مدرسه'));
});
test('similarity gate blocks near-identical text and passes distinct text', () => {
  const base = 'اشتراك دولينجو سوبر يزيل الاعلانات ويمنحك محاولات غير محدودة في كل درس تدرسه يوميا';
  assert.equal(checkPair(base, base).pass, false);
  assert.equal(checkPair(base, 'الدفع يتم بعملة رقمية على شبكة محددة ثم تكتب بريدك لتستلم الرابط').pass, true);
});
test('containment is asymmetric-safe', () => assert.equal(containment('a b c d e f', 'x y z'), 0));
