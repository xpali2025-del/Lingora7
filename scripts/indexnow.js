// Notify IndexNow-enabled engines (Bing, Yandex, Seznam, Naver) of new/changed URLs after a deploy.
//   INDEXNOW_KEY=<8-128 char key> SITE_URL=https://lingora.world npm run indexnow
// Google does not support IndexNow: submit the sitemap in Search Console instead (see README).
const key = process.env.INDEXNOW_KEY, site = (process.env.SITE_URL || '').replace(/\/$/, '');
if (!key || !site) { console.error('set INDEXNOW_KEY and SITE_URL'); process.exit(1); }
const sm = await (await fetch(site + '/sitemap.xml')).text();
const urlList = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: new URL(site).host, key, keyLocation: `${site}/indexnow-key/`, urlList }) });
console.log(`IndexNow: ${urlList.length} URLs -> HTTP ${r.status}`); process.exit(r.ok || r.status === 202 ? 0 : 1);
