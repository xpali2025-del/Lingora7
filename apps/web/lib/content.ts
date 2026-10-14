import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { langOf, dirOf, type Lang } from '../components/i18n';

export const SITE_URL = (process.env.SITE_URL || 'https://lingora.world').replace(/\/$/, '');
const DIR = process.env.CONTENT_DIR || path.join(process.cwd(), '..', '..', 'content');

export type Page = {
  url: string; locale: string; lang: Lang; dir: 'rtl' | 'ltr';
  title: string; description: string; html: string; draft: boolean;
  unresolved: string[]; hreflangGroup?: string; lastmod: string;
  kind?: string; priceUsdt?: number; faq: { q: string; a: string }[]; h1: string;
};

function parse(md: string) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  const fm: Record<string, string> = {};
  if (m) for (const line of m[1].split('\n')) {
    const i = line.indexOf(':'); if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: m ? md.slice(m[0].length) : md };
}

// FAQ = a bold question line (ends with ? or ؟) followed by its answer line. Only visible text is used.
function parseFaq(body: string) {
  const out: { q: string; a: string }[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(/^\*\*(.+[?؟？])\*\*$/);
    if (m && lines[i + 1]?.trim()) out.push({ q: m[1], a: lines[i + 1].trim().replace(/\[VERIFY[^\]]*\]/g, '').replace(/[*_]/g, '') });
  }
  return out;
}
export function allPages(): Page[] {
  return fs.readdirSync(DIR).filter(f => f.endsWith('.md')).map(f => {
    const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
    const { fm, body } = parse(raw);
    const unresolved = [...(body + fm.title + fm.description).matchAll(/\{\{[^}]+\}\}|\[VERIFY[^\]]*\]/g)].map(x => x[0]);
    const lang = langOf(fm.locale);
    return {
      url: fm.url, locale: fm.locale, lang, dir: dirOf(lang),
      title: fm.title, description: fm.description,
      html: marked.parse(body, { async: false }) as string,
      // A page is a draft if flagged DRAFT OR still has unresolved placeholders/VERIFY markers.
      draft: fm.status?.startsWith('DRAFT') || unresolved.length > 0,
      unresolved, hreflangGroup: fm.hreflang_group,
      kind: fm.kind, priceUsdt: fm.price_usdt ? Number(fm.price_usdt) : undefined,
      faq: parseFaq(body), h1: (body.match(/^# (.+)$/m) || [])[1] || fm.title,
      lastmod: fm.last_modified || '2026-10-14',   // content-check enforces last_modified on every page
    };
  });
}
export const pageByPath = (segs: string[]) => {
  const url = '/' + segs.join('/') + '/';
  return allPages().find(p => p.url === url);
};
// Alternates only between genuine equivalents (same hreflang_group), reciprocal, with x-default=/en/.
export function alternatesFor(p: Page) {
  if (!p.hreflangGroup) return undefined;
  const g = allPages().filter(x => x.hreflangGroup === p.hreflangGroup && !x.draft);
  if (g.length < 2) return undefined;
  const languages: Record<string, string> = {};
  for (const x of g) languages[x.locale] = SITE_URL + x.url;
  const en = g.find(x => x.locale === 'en'); if (en) languages['x-default'] = SITE_URL + en.url;
  return languages;
}
/** The market whose price/checkout this page offers (market pages and the Arabic price page). */
export function marketCodeFor(p: Page): string | null {
  if (p.kind === 'market') return p.url.replace(/\//g, '');
  if (p.url === '/ar/price/') return 'ar';
  return null;
}
