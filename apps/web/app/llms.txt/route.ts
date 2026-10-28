import { allPages, SITE_URL } from '@/lib/content';
// Plain-text site map for AI crawlers (llms.txt convention): what the site is, then every indexable page with its summary.
export const dynamic = 'force-static';
export function GET() {
  const pages = allPages().filter(p => !p.draft);
  const group = (title: string, pick: (k?: string) => boolean) => {
    const rows = pages.filter(p => pick(p.kind)).map(p => `- [${p.h1}](${SITE_URL}${p.url}): ${p.description}`);
    return rows.length ? `\n## ${title}\n${rows.join('\n')}\n` : '';
  };
  const body = `# Lingora

> Lingora is an independent reseller of 12-month Duolingo Super activation links, paid in USDT on the BEP20 network. It is not affiliated with Duolingo. Buyers receive a link by email and redeem it themselves in a web browser.
${group('Markets (price and checkout)', k => k === 'market')}${group('Guides', k => k === 'guide' || k === 'hub')}${group('Company and policies', k => k === 'policy')}`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
