import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../globals.css';
export const metadata: Metadata = { title: 'Lingora Admin', robots: { index: false, follow: false } };
export default function Root({ children }: { children: ReactNode }) { return (<html lang="en" dir="ltr"><body>{children}</body></html>); }
