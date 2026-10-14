import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ReviewForm from '@/components/ReviewForm';
import { LANG_CODES, type Lang } from '@/components/i18n';
export const dynamicParams = false;
export const generateStaticParams = () => LANG_CODES.map(locale => ({ locale }));
export const metadata: Metadata = { title: 'Review', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params; if (!(LANG_CODES as string[]).includes(locale)) notFound();
  return <ReviewForm lang={locale as Lang} />;
}
