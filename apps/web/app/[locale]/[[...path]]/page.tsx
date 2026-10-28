import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { allPages, pageByPath, alternatesFor, marketCodeFor, SITE_URL } from '@/lib/content';
import BuyBox from '@/components/BuyBox';
import Safe from '@/components/Safe';
import { Breadcrumbs } from '@/components/Chrome';
import { OG_IMAGE } from '@/lib/meta';
import ReviewsList from '@/components/ReviewsList';
import { marketInfo, getContact, contactListHtml, getYemenPayments, paymentBlocksHtml } from '@/lib/data';
import TopupForm from '@/components/TopupForm';

export const dynamicParams = true;   // required for on-demand revalidation; unknown URLs still 404 via notFound()
export const revalidate = 300;   // ISR: live price + approved reviews refresh at most every 5 min (and on admin changes)
export function generateStaticParams() {
  return allPages().map(p => { const segs = p.url.split('/').filter(Boolean); return { locale: segs[0], path: segs.slice(1) }; });
}
type Props = { params: Promise<{ locale: string; path?: string[] }> };
const segsOf = async (params: Props['params']) => { const { locale, path } = await params; return [locale, ...(path ?? [])]; };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = pageByPath(await segsOf(params)); if (!p) return {};
  return {
    title: p.title, description: p.description,
    alternates: { canonical: SITE_URL + p.url, languages: alternatesFor(p) },
    robots: p.draft ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: { title: p.title, description: p.description, url: SITE_URL + p.url, locale: p.locale.replace('-', '_'), images: [OG_IMAGE] },
  };
}

export default async function Page({ params }: Props) {
  const p = pageByPath(await segsOf(params)); if (!p) notFound();
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DRAFT !== '1' && p.draft && process.env.STRICT === '1')
    throw new Error(`Unresolved placeholders in ${p.url}: ${p.unresolved.join(', ')}`);
  const mc = marketCodeFor(p);
  const info = mc && p.kind === 'market' ? await marketInfo(mc) : null;
  const price = info?.price ?? p.priceUsdt;   // database wins over the Markdown value
  const ld: object[] = [
    { '@context': 'https://schema.org', '@type': 'WebPage', '@id': SITE_URL + p.url, url: SITE_URL + p.url, name: p.title, description: p.description, inLanguage: p.locale,
      dateModified: p.lastmod, isPartOf: { '@type': 'WebSite', name: 'Lingora', url: SITE_URL + '/' }, publisher: { '@type': 'Organization', name: 'Lingora', url: SITE_URL + '/' } },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: ({ ar: 'الرئيسية', hi: 'होम', fr: 'Accueil', zh: '首页', en: 'Home' } as Record<string, string>)[p.lang], item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: p.h1, item: SITE_URL + p.url }] },
  ];
  // Price is shown in USDT in the visible text; markup uses USD (USDT is not an ISO 4217 code).
  if (p.kind === 'market' && price) ld.push({ '@context': 'https://schema.org', '@type': 'Product',
    name: p.h1, description: p.description, image: SITE_URL + '/og.png', brand: { '@type': 'Brand', name: 'Duolingo' }, sku: `DUOLINGO-SUPER-12M-${p.url.replace(/\//g, '')}`, offers: { '@type': 'Offer', price: String(price),
      priceCurrency: 'USD', availability: 'https://schema.org/InStock', url: SITE_URL + p.url,
      // Digital link: no returns after delivery except the cases listed on the refund policy page.
      hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', ...(info?.country ? { applicableCountry: info.country } : {}),
        returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted', merchantReturnLink: SITE_URL + `/${p.lang}/refund-policy/` } },
    // Only genuine, moderated, verified-buyer reviews are ever emitted. No AggregateRating on purpose.
    ...(info?.reviews.length ? { review: info.reviews.slice(0, 5).map(r => ({ '@type': 'Review', author: { '@type': 'Person', name: r.name }, datePublished: r.at,
      reviewBody: r.body, reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 } })) } : {}) });
  if (p.faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(f => ({
    '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  let html = p.html;
  if (html.includes('<!--CONTACT-->')) html = html.replace('<!--CONTACT-->', contactListHtml(await getContact(), p.lang === 'ar' ? 'ar' : 'en'));
  if (html.includes('<!--PAYMENTS-->')) html = html.replace('<!--PAYMENTS-->', paymentBlocksHtml(await getYemenPayments(), 'تفاصيل حسابات الدفع المحلية تصلك عند التواصل معنا. اكتب لنا عبر نموذج الطلب أدناه أو على بريد الدعم.'));
  return (
    <main className="page">
      <Breadcrumbs lang={p.lang} current={p.h1} />
      {p.draft && <p className="draft">مسودة — غير مفهرسة (noindex)</p>}
      {!p.draft && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />}
      {mc && !p.draft && price ? <Safe><BuyBox market={mc} lang={p.lang} price={price} inStock={info?.inStock ?? true} /></Safe> : null}
      <article dangerouslySetInnerHTML={{ __html: html }} />
      {p.topup && !p.draft && <Safe><TopupForm lang={p.lang} /></Safe>}
      {p.kind === 'market' && !p.draft && <ReviewsList reviews={info?.reviews ?? []} lang={p.lang} />}
    </main>
  );
}
