// Single source of truth for markets. Mirrors section 2.1 of the plan.
export const SITE_URL = 'https://lingora.world';
export const MARKETS = [
  { code: 'en',    hreflang: 'en',    lang: 'en', dir: 'ltr', tier: 'intl', priceUsdt: 15, status: 'live' },
  { code: 'ar',    hreflang: 'ar',    lang: 'ar', dir: 'rtl', tier: 'arab', priceUsdt: 13, status: 'live' },
  { code: 'ar-eg', hreflang: 'ar-EG', lang: 'ar', dir: 'rtl', tier: 'arab', priceUsdt: 13, status: 'live' },
  { code: 'ar-sa', hreflang: 'ar-SA', lang: 'ar', dir: 'rtl', tier: 'arab', priceUsdt: 13, status: 'live' },
  { code: 'ar-ae', hreflang: 'ar-AE', lang: 'ar', dir: 'rtl', tier: 'arab', priceUsdt: 13, status: 'live' },
  { code: 'ar-qa', hreflang: 'ar-QA', lang: 'ar', dir: 'rtl', tier: 'arab', priceUsdt: 13, status: 'live' },
  { code: 'en-gb', hreflang: 'en-GB', lang: 'en', dir: 'ltr', tier: 'intl', priceUsdt: 15, status: 'live' },
  { code: 'id-id', hreflang: 'id-ID', lang: 'id', dir: 'ltr', tier: 'intl', priceUsdt: 15, status: 'draft' },
  { code: 'tr-tr', hreflang: 'tr-TR', lang: 'tr', dir: 'ltr', tier: 'intl', priceUsdt: 15, status: 'draft' },
];
export const X_DEFAULT = 'en';
export const liveMarkets = () => MARKETS.filter(m => m.status === 'live');
