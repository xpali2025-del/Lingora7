import type { MetadataRoute } from 'next';
import { allPages, alternatesFor, SITE_URL } from '@/lib/content';
export default function sitemap(): MetadataRoute.Sitemap {
  const home = { url: SITE_URL + '/', lastModified: allPages().map(p => p.lastmod).sort().pop() };
  return [home, ...allPages().filter(p => !p.draft).map(p => ({ url: SITE_URL + p.url, lastModified: p.lastmod,
    alternates: alternatesFor(p) ? { languages: alternatesFor(p) } : undefined }))];
}
