// Release gate: SEO validation (titles, H1, similarity <20%), facts registry resolution, no placeholders in LIVE pages.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let bad = 0;
try { console.log(execFileSync('node', ['packages/seo-core/scripts/validate.js', 'content'], { cwd: root, encoding: 'utf8' })); }
catch (e) { console.log(e.stdout || e.message); bad++; }
for (const f of readdirSync(path.join(root, 'content')).filter(f => f.endsWith('.md'))) {
  const md = readFileSync(path.join(root, 'content', f), 'utf8');
  const live = /^status:\s*LIVE/m.test(md);
  const left = md.replace(/<!--[\s\S]*?-->/g, '').match(/\{\{[^}]+\}\}|\[VERIFY[^\]]*\]/g);
  if (live && left) { console.log(`FAIL ${f}: unresolved ${left.join(', ')}`); bad++; }
}

// ---- P1 gates: keyword uniqueness, freshness, local value, price parity with the DB seed ----
import { frontMatter, authoredText } from '../packages/seo-core/src/content.js';
const list = v => String(v || '').replace(/^\[|\]$/g, '').split(',').map(x => x.trim()).filter(Boolean);
const seed = readFileSync(path.join(root, 'db/seed.sql'), 'utf8');
const seedPrice = Object.fromEntries([...seed.matchAll(/\('([a-z-]+)',\s*(?:NULL|'[A-Z]+'),\s*'[^']+',\s*'[a-z]+',\s*'[a-z]+',\s*(\d+(?:\.\d+)?),/g)].map(m => [m[1], Number(m[2])]));
const seen = new Map();
for (const f of readdirSync(path.join(root, 'content')).filter(f => f.endsWith('.md'))) {
  const md = readFileSync(path.join(root, 'content', f), 'utf8'); const fm = frontMatter(md);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fm.last_modified || '')) { console.log(`FAIL ${f}: last_modified (YYYY-MM-DD) missing`); bad++; }
  const heads = [...md.replace(/^---[\s\S]*?---/, '').matchAll(/^#{2,4} (.+)$/gm)].map(m => m[1].trim());
  for (const h of new Set(heads.filter((x, i) => heads.indexOf(x) !== i))) { console.log(`FAIL ${f}: duplicate heading "${h}"`); bad++; }
  if (String(fm.description || '').length < 70) { console.log(`FAIL ${f}: description shorter than 70 chars`); bad++; }
  const lang = String(fm.locale).slice(0, 2);
  for (const k of [fm.primary_keyword, ...list(fm.secondary_keywords)].filter(Boolean)) {
    const key = lang + '|' + k.toLowerCase();
    if (seen.has(key)) { console.log(`FAIL ${f}: keyword "${k}" also targeted by ${seen.get(key)} (cannibalization)`); bad++; } else seen.set(key, f);
    if (f === 'ar-price.md' || fm.kind === 'guide' || fm.kind === 'market') {
      if (fm.primary_keyword === k && !authoredText(md).toLowerCase().includes(k.toLowerCase())) { console.log(`WARN ${f}: primary keyword "${k}" not present verbatim in body`); }
    }
  }
  if (fm.kind === 'market') {
    if (list(fm.local_facts).length < 3) { console.log(`FAIL ${f}: market pages need >= 3 local_facts`); bad++; }
    const at = authoredText(md); const cjk = (at.match(/[\u4e00-\u9fff]/g) || []).length; const words = at.replace(/[\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(Boolean).length + Math.round(cjk / 2);   // CJK: ~2 characters per word
    if (words < 350) { console.log(`FAIL ${f}: only ${words} words (min 350)`); bad++; }
    const code = fm.url.replace(/\//g, '');
    if (seedPrice[code] !== undefined && Number(fm.price_usdt) !== seedPrice[code]) { console.log(`FAIL ${f}: price_usdt ${fm.price_usdt} != seed ${seedPrice[code]}`); bad++; }
  }
}
console.log(bad ? 'content-check FAILED' : 'content-check OK'); process.exit(bad ? 1 : 0);
