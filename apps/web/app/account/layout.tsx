import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../globals.css';
export const metadata: Metadata = { title: 'Account', robots: { index: false, follow: false } };
export default function Root({ children }: { children: ReactNode }) { return (<html><body>{children}</body></html>); }
