import { NextResponse } from 'next/server';
import { safeEqual } from '@lingora/shared';
import { runTick } from '@/lib/tick';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Called every few minutes by a free scheduler (see .github/workflows/tick.yml). Requires `Authorization: Bearer $CRON_SECRET`. */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const given = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!given || !safeEqual(given, secret)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { return NextResponse.json(await runTick(5)); }
  catch (e: any) { console.error('tick failed', e); return NextResponse.json({ error: 'tick_failed', message: String(e?.message || e).slice(0, 200) }, { status: 500 }); }
}
export const GET = handle, POST = handle;
