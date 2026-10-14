import type { ReactNode } from 'react';
import '../globals.css';
import { rootMetadata } from '@/lib/meta';
import { Header, Footer } from '@/components/Chrome';
export const metadata = rootMetadata;
export default function Root({ children }: { children: ReactNode }) {
  return (<html lang="en" dir="ltr"><body><Header lang="en" />{children}<Footer lang="en" /></body></html>);
}
