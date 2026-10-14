import { SITE_URL, MARKETS, X_DEFAULT } from './markets.js';

const marketByCode = Object.fromEntries(MARKETS.map(m => [m.code, m]));

export const absUrl = (code, slug = '') =>
  `${SITE_URL}/${code}/${slug ? slug.replace(/^\/|\/$/g, '') + '/' : ''}`;

/** A page = { id, hreflangGroup, locale, slug }. Alternates only between true equivalents. */
export function hreflangFor(page, allPages) {
  const group = allPages.filter(p => p.hreflangGroup === page.hreflangGroup &&
    marketByCode[p.locale]?.status === 'live');
  if (group.length < 2) return [];            // no equivalents -> no alternates
  const links = group.map(p => ({ hreflang: marketByCode[p.locale].hreflang, href: absUrl(p.locale, p.slug) }));
  const def = group.find(p => p.locale === X_DEFAULT);
  if (def) links.push({ hreflang: 'x-default', href: absUrl(def.locale, def.slug) });
  return links;
}

export const canonicalFor = page => absUrl(page.locale, page.slug);

export function sitemapFor(locale, pages, allPages) {
  const esc = s => s.replace(/&/g, '&amp;');
  const urls = pages.filter(p => p.locale === locale && !p.noindex).map(p => {
    const alts = hreflangFor(p, allPages).map(a =>
      `    <xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}"/>`).join('\n');
    return `  <url>\n    <loc>${esc(canonicalFor(p))}</loc>\n    <lastmod>${p.lastmod}</lastmod>\n${alts}\n  </url>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`;
}

/** Product+Offer JSON-LD. USDT is not an ISO 4217 code, so markup uses the USD equivalent
 *  (USDT is pegged ~1:1) and the visible page text must also state the price in USDT. */
export function productJsonLd(market, { name, description }) {
  return {
    '@context': 'https://schema.org', '@type': 'Product', name, description,
    offers: { '@type': 'Offer', price: String(market.priceUsdt), priceCurrency: 'USD',
      availability: 'https://schema.org/InStock', url: absUrl(market.code) },
  };
}

export function faqJsonLd(items) {
  return { '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: items.map(q => ({ '@type': 'Question', name: q.q,
      acceptedAnswer: { '@type': 'Answer', text: q.a } })) };
}
// NOTE: no AggregateRating/Review helper on purpose. Add only from genuine verified reviews.
