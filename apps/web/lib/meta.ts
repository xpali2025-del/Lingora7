import type { Metadata } from 'next';
import { SITE_URL } from './content';
export const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'Lingora logo' };
export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL), applicationName: 'Lingora', icons: { icon: [{ url: '/favicon.ico', sizes: 'any' }, { url: '/icon-48.png', sizes: '48x48', type: 'image/png' }, { url: '/icon-96.png', sizes: '96x96', type: 'image/png' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icon-512.png', sizes: '512x512', type: 'image/png' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }] },
  manifest: '/manifest.webmanifest',
  openGraph: { siteName: 'Lingora', type: 'website', images: [OG_IMAGE] },
  twitter: { card: 'summary_large_image', images: [OG_IMAGE.url] },
};
