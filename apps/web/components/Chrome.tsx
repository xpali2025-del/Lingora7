import Link from 'next/link';
import { type Lang, dirOf } from './i18n';
import { getContact, SOCIALS } from '@/lib/data';

const NAV = {
  ar: { home: 'الرئيسية', links: [['/ar/price/', 'الأسعار'], ['/ar/how-to-redeem/', 'طريقة التفعيل'], ['/ar/super-vs-free/', 'سوبر أم المجاني']],
    foot: [['/ar/about/', 'من نحن'], ['/ar/refund-policy/', 'سياسة الاسترجاع'], ['/ar/privacy-policy/', 'سياسة الخصوصية'], ['/ar/disclaimer/', 'إخلاء المسؤولية']],
    other: ['/en/', 'English'], note: 'Lingora موقع مستقل لإعادة البيع وليس تابعًا لـ Duolingo.', support: 'الدعم', pick: 'اختر دولتك', markets: [['/ar-eg/', 'مصر'], ['/ar-sa/', 'السعودية'], ['/ar-ae/', 'الإمارات'], ['/ye/', 'اليمن'], ['/en/', 'International · English'], ['/en-gb/', 'United Kingdom'], ['/hi/', 'हिन्दी'], ['/fr/', 'Français'], ['/zh/', '中文']], label: 'التنقل الرئيسي' },
  en: { home: 'Home', links: [['/en/', 'Duolingo Super'], ['/en/how-to-redeem/', 'How to redeem']],
    foot: [['/en/about/', 'About'], ['/en/refund-policy/', 'Refund policy'], ['/en/privacy-policy/', 'Privacy policy'], ['/en/disclaimer/', 'Disclaimer']],
    other: ['/ar-eg/', 'العربية'], note: 'Lingora is an independent reseller and is not affiliated with Duolingo.', support: 'Support', pick: 'Choose your country', markets: [['/en/', 'International'], ['/en-gb/', 'United Kingdom'], ['/ar-eg/', 'مصر'], ['/ar-sa/', 'السعودية'], ['/ar-ae/', 'الإمارات'], ['/ye/', 'اليمن'], ['/hi/', 'हिन्दी (India)'], ['/fr/', 'Français'], ['/zh/', '中文']], label: 'Main navigation' },
  hi: { home: 'होम', links: [['/hi/how-to-redeem/', 'एक्टिवेट कैसे करें']],
    foot: [['/en/about/', 'हमारे बारे में (English)'], ['/en/refund-policy/', 'रिफंड नीति (English)'], ['/en/privacy-policy/', 'गोपनीयता नीति (English)'], ['/en/disclaimer/', 'अस्वीकरण (English)']],
    other: ['/en/', 'English'], note: 'Lingora एक स्वतंत्र पुनर्विक्रेता है और Duolingo से जुड़ा या अधिकृत नहीं है।', support: 'सहायता', pick: 'अपना देश चुनें', markets: [['/hi/', 'भारत (हिन्दी)'], ['/en/', 'International · English'], ['/fr/', 'Français'], ['/zh/', '中文']], label: 'मुख्य नेविगेशन' },
  fr: { home: 'Accueil', links: [['/fr/how-to-redeem/', 'Activer Duolingo Super']],
    foot: [['/en/about/', 'À propos (EN)'], ['/en/refund-policy/', 'Remboursement (EN)'], ['/en/privacy-policy/', 'Confidentialité (EN)'], ['/en/disclaimer/', 'Mentions (EN)']],
    other: ['/en/', 'English'], note: 'Lingora est un revendeur indépendant, non affilié à Duolingo ni autorisé par lui.', support: 'Assistance', pick: 'Choisissez votre pays', markets: [['/fr/', 'France et pays francophones'], ['/en/', 'International · English'], ['/hi/', 'हिन्दी'], ['/zh/', '中文']], label: 'Navigation principale' },
  zh: { home: '首页', links: [['/zh/how-to-redeem/', '如何兑换']],
    foot: [['/en/about/', '关于我们（英文）'], ['/en/refund-policy/', '退款政策（英文）'], ['/en/privacy-policy/', '隐私政策（英文）'], ['/en/disclaimer/', '免责声明（英文）']],
    other: ['/en/', 'English'], note: 'Lingora 是独立的转售商，与 Duolingo 无隶属或授权关系。', support: '客服', pick: '选择您的地区', markets: [['/zh/', '中文用户'], ['/en/', 'International · English'], ['/hi/', 'हिन्दी'], ['/fr/', 'Français']], label: '主导航' },
} as const;
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@lingora.world';

export function Header({ lang }: { lang: Lang }) {
  const n = NAV[lang];
  return (
    <header className="site-head">
      <Link href="/" className="logo" title="Lingora"><img src="/logo-horizontal.png" width={103} height={44} alt={({ ar: 'شعار Lingora - روابط تفعيل دولينجو سوبر', hi: 'Lingora लोगो - Duolingo Super एक्टिवेशन लिंक', fr: 'Logo Lingora - liens d\'activation Duolingo Super', zh: 'Lingora 标志 - 多邻国 Duolingo Super 激活链接', en: 'Lingora logo - Duolingo Super activation links' } as Record<string, string>)[lang]} fetchPriority="high" decoding="async" /></Link>
      <nav aria-label={n.label}><Link href="/">{n.home}</Link>{n.links.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}
        <CountryPicker lang={lang} />
        <LangPicker lang={lang} /></nav>
    </header>
  );
}
const LANG_LINKS: [string, string, string][] = [['/en/', 'English', 'en'], ['/ar-eg/', 'العربية', 'ar'], ['/hi/', 'हिन्दी', 'hi'], ['/fr/', 'Français', 'fr'], ['/zh/', '中文', 'zh']];
export function LangPicker({ lang }: { lang: Lang }) {
  return (<details className="mk lg"><summary aria-label="Language">🌐 {LANG_LINKS.find(x => x[2] === lang)?.[1]}</summary><div>{LANG_LINKS.filter(x => x[2] !== lang).map(([h, l, c]) => <Link key={h} href={h} hrefLang={c} lang={c}>{l}</Link>)}</div></details>);
}
export function CountryPicker({ lang }: { lang: Lang }) {
  const n = NAV[lang];
  return (<details className="mk"><summary>{n.pick}</summary><div>{n.markets.map(([h, l]) => <Link key={h} href={h} lang={/[\u0600-\u06FF]/.test(l) ? 'ar' : /[\u0900-\u097F]/.test(l) ? 'hi' : /[\u4e00-\u9fff]/.test(l) ? 'zh' : /^Fran/.test(l) ? 'fr' : 'en'}>{l}</Link>)}</div></details>);
}
export async function Footer({ lang }: { lang: Lang }) {
  const n = NAV[lang]; const c = await getContact();
  return (
    <footer className="site-foot">
      <nav aria-label="Footer">{n.foot.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}<a href={`mailto:${c.email}`}>{n.support}: {c.email}</a>
        {c.whatsapp && <a href={`https://wa.me/${c.whatsapp}`} rel="noopener nofollow">WhatsApp</a>}</nav>
      {SOCIALS.some(([k]) => c[k]) && <nav aria-label="Social">{SOCIALS.filter(([k]) => c[k]).map(([k, name]) => <a key={k} href={String(c[k])} rel="me noopener nofollow">{name}</a>)}</nav>}
      {c.legal_name && <p>{c.legal_name}</p>}
      <p>{n.note}</p>
    </footer>
  );
}
export function Breadcrumbs({ lang, current }: { lang: Lang; current: string }) {
  const n = NAV[lang];
  return (<nav aria-label="Breadcrumb" className="crumbs"><Link href="/">{n.home}</Link> <span aria-hidden>›</span> <span aria-current="page">{current}</span></nav>);
}
