import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/content';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/order/', '/ar/review/', '/en/review/'] }], sitemap: `${SITE_URL}/sitemap.xml` };
}
