import type { ReactNode } from 'react';
import '../globals.css';
import { rootMetadata } from '@/lib/meta';
import { Header, Footer } from '@/components/Chrome';
import { langOf, dirOf } from '@/components/i18n';
export const metadata = rootMetadata;

// Root layout of the localized site: sets <html lang dir> from the first URL segment.
export default async function Root({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params; const lang = langOf(locale);
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <body><Header lang={lang} />{children}<Footer lang={lang} /></body>
    </html>
  );
}
