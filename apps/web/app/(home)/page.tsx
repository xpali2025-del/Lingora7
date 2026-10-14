import type { Metadata } from 'next';
import Link from 'next/link';
import { CountryPicker } from '@/components/Chrome';
import { SITE_URL } from '@/lib/content';
import { getContact, SOCIALS } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Lingora | Duolingo Super Activation Links · دولينجو سوبر',
  description: 'Independent reseller of 12-month Duolingo Super activation links, paid in USDT (BEP20). Pick your country for price and steps. موقع مستقل لروابط تفعيل دولينجو سوبر.',
  alternates: { canonical: SITE_URL + '/' },
};
export default async function Home() {
  const c: any = await getContact(); const SUPPORT_EMAIL = c.email;
  const sameAs = SOCIALS.map(([k]) => c[k]).filter(Boolean);
  const ld = [
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Lingora', url: SITE_URL + '/', logo: { '@type': 'ImageObject', url: SITE_URL + '/logo-square.png', width: 800, height: 800 }, image: SITE_URL + '/logo-square.png', email: SUPPORT_EMAIL, ...(sameAs.length ? { sameAs } : {}), ...(c.legal_name ? { legalName: c.legal_name } : {}) },
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Lingora', url: SITE_URL + '/', inLanguage: ['en', 'ar', 'hi', 'fr', 'zh'] },
  ];
  return (
    <main className="page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <section className="hero">
        <span className="pill">Duolingo Super · 12 months</span>
        <h1>Lingora: Duolingo Super activation links, explained and delivered</h1>
        <p className="lede">Lingora is an independent reseller of 12-month Duolingo Super activation links. You pay in USDT on the BEP20 network, enter your email, and receive the link you redeem yourself in a web browser. We are not affiliated with Duolingo.</p>
      </section>

      <h2>Choose your country</h2>
      <p>Prices, payment notes and local guidance differ slightly by market. Pick the page that matches you from the menu below.</p>
      <CountryPicker lang="en" />

      <h2>How it works</h2>
      <ol className="steps">
        <li><div><b>1. Pick your market and start an order.</b>The price is fixed per market and shown before you pay.</div></li>
        <li><div><b>2. Send the exact USDT amount on BEP20.</b>Each order gets a unique amount so we can match your payment automatically. Orders expire after 30 minutes.</div></li>
        <li><div><b>3. Enter your email and redeem.</b>After the payment is confirmed you receive the activation link and redeem it at duolingo.com/redeem in a web browser.</div></li>
      </ol>

      <h2>Guides</h2>
      <div className="grid">
        <Link className="card" href="/en/how-to-redeem/"><h3>How to redeem a Duolingo Super link</h3><p>Steps, eligibility rules and a table of common errors with fixes.</p></Link>
        <Link className="card" href="/ar/how-to-redeem/" dir="rtl" lang="ar"><h3>طريقة تفعيل دولينجو سوبر</h3><p>خطوات التفعيل وجدول الأخطاء الشائعة وحلولها.</p></Link>
        <Link className="card" href="/hi/how-to-redeem/" lang="hi"><h3>Duolingo Super रिडीम कैसे करें</h3><p>हिन्दी में कदम और आम गलतियों के हल।</p></Link>
        <Link className="card" href="/fr/how-to-redeem/" lang="fr"><h3>Activer Duolingo Super</h3><p>Les étapes en français et les erreurs courantes.</p></Link>
        <Link className="card" href="/zh/how-to-redeem/" lang="zh"><h3>多邻国 Super 兑换教程</h3><p>中文步骤与常见错误的解决方法。</p></Link>
        <Link className="card" href="/ar/price/" dir="rtl" lang="ar"><h3>سعر دولينجو سوبر</h3><p>السعر بالتفصيل وما الذي يضيفه الاشتراك.</p></Link>
        <Link className="card" href="/ar/super-vs-free/" dir="rtl" lang="ar"><h3>الفرق بين المجاني وسوبر</h3><p>مقارنة واضحة لتقرر إن كان سوبر يناسبك.</p></Link>
      </div>
      <p>Questions before you buy? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with your order reference if you already have one.</p>
    </main>
  );
}
