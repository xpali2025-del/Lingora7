import { NextResponse } from 'next/server';
import { getSetting } from '@lingora/shared';
import { db } from '@/lib/server';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const hb = Number(await getSetting(db(), 'worker_heartbeat', 0));
    return NextResponse.json({ ok: true, workerAgeSec: hb ? Math.round((Date.now() - hb) / 1000) : null });
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}
