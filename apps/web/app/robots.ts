import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/content';
import { LANG_CODES } from '@/components/i18n';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/order/', ...LANG_CODES.map(l => `/${l}/review/`)] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
