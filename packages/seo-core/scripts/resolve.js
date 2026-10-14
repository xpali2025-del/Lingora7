// Usage: node scripts/resolve.js <contentDir> <registry.json> [--out <dir>] [--needed <csv>]
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { frontMatter } from '../src/content.js';
import { resolvePage, findPlaceholders } from '../src/registry.js';

const [dir, regPath, ...rest] = process.argv.slice(2);
const opt = f => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : null; };
const registry = JSON.parse(readFileSync(regPath, 'utf8'));
const outDir = opt('--out'), neededCsv = opt('--needed');
if (outDir) mkdirSync(outDir, { recursive: true });

let blocked = 0; const needed = new Map();
for (const f of readdirSync(dir).filter(f => f.endsWith('.md'))) {
  const md = readFileSync(join(dir, f), 'utf8');
  const fm = frontMatter(md);
  const r = resolvePage({ text: md, locale: fm.locale }, registry);
  for (const k of new Set(findPlaceholders(md))) {
    const row = needed.get(k) || { pages: new Set(), locales: new Set() };
    row.pages.add(f); row.locales.add(fm.locale); needed.set(k, row);
  }
  console.log(`${r.ready ? 'READY  ' : 'BLOCKED'} ${f}  unresolved=${r.problems.length} verify_markers=${r.verifyLeft}`);
  if (!r.ready) blocked++;
  if (outDir && r.ready) writeFileSync(join(outDir, f), r.text.replace(/^status:.*$/m, 'status: LIVE'));
}
if (neededCsv) {
  const rows = ['key,locales,pages,value,source_url,verified_at,expires_at'];
  for (const [k, v] of [...needed].sort()) rows.push([k, [...v.locales].join('|'), [...v.pages].join('|'), '', '', '', ''].join(','));
  writeFileSync(neededCsv, rows.join('\n') + '\n');
  console.log(`wrote ${needed.size} required keys to ${neededCsv}`);
}
console.log(`${blocked} page(s) blocked`);
process.exit(0);
