import type { Metadata } from 'next';
import OrderClient from '@/components/OrderClient';
export const metadata: Metadata = { title: 'Order', robots: { index: false, follow: false } };
export default function Page() { return <OrderClient />; }
