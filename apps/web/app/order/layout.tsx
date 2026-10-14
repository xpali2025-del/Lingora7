import type { ReactNode } from 'react';
import '../globals.css';
import { rootMetadata } from '@/lib/meta';
export const metadata = rootMetadata;
export default function Root({ children }: { children: ReactNode }) { return (<html><body>{children}</body></html>); }
