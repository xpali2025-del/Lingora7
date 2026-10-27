// Rendered-HTML SEO/technical gate. Run against a running production server:
//   npm -w apps/web run start &   then   npm run seo:check -- http://localhost:3000
// Exit code 1 on any failure. Checks what Googlebot actually receives (not the Markdown).
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const SITE = (process.env.SITE_URL || 'https://lingora.world').replace(/\/$/, '');
const fails = [], warns = [];
const F = (u, m) => fails.push(`${u}: ${m}`), W = (u, m) => warns.push(`${u}: ${m}`);
const get = async p => { const r = await fetch(base + p, { redirect: 'manual' }); return { r, h: r.status === 200 ? await r.text() : '' }; };
const attr = (h, re) => (h.match(re) || [])[1];

const sm = (await (await fetch(base + '/sitemap.xml')).text());
const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
if (!urls.length) F('/sitemap.xml', 'no URLs');
const paths = urls.map(u => { if (!u.startsWith(SITE)) F(u, `sitemap URL not on SITE_URL (${SITE})`); return new URL(u).pathname; });
const pages = new Map(), inbound = new Map(), titles = new Map();

for (const p of paths) {
  const { r, h } = await get(p);
  if (r.status !== 200) { F(p, `status ${r.status}`); continue; }
  const T = attr(h, /<title>([^<]*)/), D = attr(h, /<meta name="description" content="([^"]*)/), C = attr(h, /rel="canonical" href="([^"]*)/);
  if (!/<html[^>]*\blang="[a-z-]+"/i.test(h)) F(p, '<html lang> missing');
  if (!/<html[^>]*\bdir="(rtl|ltr)"/i.test(h)) F(p, '<html dir> missing');
  if (!T || T.length > 70) F(p, `title length ${T?.length}`);
  if (!D || D.length < 70 || D.length > 170) F(p, `description length ${D?.length}`);
  if ((h.match(/<h1[ >]/g) || []).length !== 1) F(p, 'must have exactly one <h1>');
  const hd = [...h.matchAll(/<h([2-4])[^>]*>([\s\S]*?)<\/h\1>/g)].map(m => m[2].replace(/<[^>]+>/g, '').trim());
  for (const x of new Set(hd.filter((y, i) => hd.indexOf(y) !== i))) F(p, `duplicate heading "${x}"`);
  if (!/<meta property="og:url"/.test(h)) F(p, 'og:url missing');
  if (C !== SITE + p) F(p, `canonical ${C} != ${SITE + p}`);
  if (/localhost|127\.0\.0\.1/.test(h) && !/localhost/.test(SITE)) F(p, 'localhost leaked into HTML');
  if (/noindex/.test(attr(h, /<meta name="robots" content="([^"]*)/) || '')) F(p, 'noindex page listed in sitemap');
  if (!/og:image/.test(h)) F(p, 'og:image missing');
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch { F(p, 'invalid JSON-LD'); } }
  if (titles.has(T)) F(p, `duplicate title with ${titles.get(T)}`); else titles.set(T, p);
  const hl = [...h.matchAll(/<link rel="alternate" hrefLang="([^"]+)" href="([^"]+)"/g)].map(m => [m[1], m[2]]);
  pages.set(p, { hl, h });
  const links = new Set([...h.matchAll(/<a [^>]*href="(\/[^"#?]*)/g)].map(m => m[1]));
  for (const l of links) { if (l.startsWith('/_next')) continue; inbound.set(l, (inbound.get(l) || new Set()).add(p)); }
}
// hreflang: reciprocal, self-referencing, targets exist in sitemap
for (const [p, { hl }] of pages) {
  if (!hl.length) continue;
  if (!hl.some(([, u]) => u === SITE + p)) F(p, 'hreflang set lacks a self-reference');
  for (const [lang, u] of hl) {
    const tp = u.replace(SITE, '');
    if (!pages.has(tp)) { F(p, `hreflang ${lang} -> ${u} not an indexable sitemap page`); continue; }
    if (lang !== 'x-default' && !pages.get(tp).hl.some(([, back]) => back === SITE + p)) F(p, `hreflang ${lang} -> ${tp} is not reciprocal`);
  }
}
// internal links resolve; every indexable page is well linked
const checked = new Set();
for (const [l, from] of inbound) { if (checked.has(l)) continue; checked.add(l); const { r } = await get(l); if (r.status >= 400) F(l, `broken internal link (from ${[...from][0]}) -> ${r.status}`); }
for (const p of paths) { const n = (inbound.get(p) || new Set()).size - (inbound.get(p)?.has(p) ? 1 : 0); if (n < 3) F(p, `only ${n} inbound internal links (min 3)`); }
for (const l of inbound.keys()) if (/^\/admin/.test(l)) F(l, 'a public page links to the admin area');
// robots + 404 behaviour
const robots = await (await fetch(base + '/robots.txt')).text();
if (!/Sitemap:/i.test(robots)) F('/robots.txt', 'no Sitemap line');
for (const bad of ['/order/', '/ar/review/', '/hi/review/', '/fr/review/', '/zh/review/']) if (!robots.includes('Disallow: ' + bad)) F('/robots.txt', `missing Disallow ${bad}`);
if (robots.includes('/admin')) F('/robots.txt', 'must not advertise the admin path (it is protected by noindex + login)');
const nf = await fetch(base + '/definitely-not-a-page/'); if (nf.status !== 404) F('/definitely-not-a-page/', `expected 404, got ${nf.status}`);
const fav = await fetch(base + '/favicon.ico'); if (fav.status !== 200) F('/favicon.ico', `status ${fav.status}`);

console.log(`checked ${paths.length} indexable pages, ${checked.size} internal link targets`);
for (const w of warns) console.log('WARN', w);
for (const f of fails) console.log('FAIL', f);
console.log(fails.length ? `seo:check FAILED (${fails.length})` : 'seo:check OK');
process.exit(fails.length ? 1 : 0);
