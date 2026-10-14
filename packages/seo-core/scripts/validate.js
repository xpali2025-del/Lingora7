// Usage: node scripts/validate.js ../content
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { authoredText, frontMatter } from '../src/content.js';
import { checkPair } from '../src/similarity.js';

const dir = process.argv[2] || '../content';
const pages = readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
  const md = readFileSync(join(dir, f), 'utf8'); const fm = frontMatter(md);
  return { f, fm, text: authoredText(md), md };
});
let fail = 0; const err = (m) => { console.log('FAIL', m); fail++; };

for (const p of pages) {
  const t = p.fm.title || '', d = p.fm.description || '', kw = p.fm.primary_keyword || '';
  if (!t) err(`${p.f}: missing title`); else if (t.length > 70) err(`${p.f}: title ${t.length} chars (>70)`);
  if (!d) err(`${p.f}: missing description`); else if (d.length > 170) err(`${p.f}: description ${d.length} chars (>170)`);
  const h1 = (p.md.match(/^# (.+)$/m) || [])[1] || '';
  if (!h1) err(`${p.f}: missing H1`);
  if (kw && !h1.toLowerCase().includes(kw.split(' ').slice(0, 2).join(' ').toLowerCase())) err(`${p.f}: primary keyword not in H1`);
  if (kw && !p.text.slice(0, 600).toLowerCase().includes(kw.split(' ').slice(0, 2).join(' ').toLowerCase()))
    console.log('WARN', p.f, 'primary keyword not in first ~100 words');
  const words = p.text.split(/\s+/).filter(Boolean);
  const kwHits = kw ? words.join(' ').split(kw).length - 1 : 0;
  console.log(`${p.f}: title=${t.length}c desc=${d.length}c words=${words.length} kw_hits=${kwHits}`);
}
for (let i = 0; i < pages.length; i++) for (let j = i + 1; j < pages.length; j++) {
  const a = pages[i], b = pages[j]; if (a.fm.locale.slice(0,2) !== b.fm.locale.slice(0,2)) continue;
  const r = checkPair(a.text, b.text);
  console.log(`similarity ${a.f} <-> ${b.f}: ${(r.worst*100).toFixed(1)}% ${r.pass ? 'OK' : 'FAIL'}`);
  if (!r.pass) err(`${a.f} vs ${b.f} exceeds 20%`);
}
const titles = pages.map(p => p.fm.title); if (new Set(titles).size !== titles.length) err('duplicate titles');
process.exit(fail ? 1 : 0);
