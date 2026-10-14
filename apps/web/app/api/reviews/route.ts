import { NextResponse } from 'next/server';
import { submitReview, approvedReviews } from '@lingora/shared';
import { db, fail, limit, jsonBody, verifyCaptcha } from '@/lib/server';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    await limit(req, 'reviews_get', 60, 60);
    const market = new URL(req.url).searchParams.get('market');
    const rows = await approvedReviews(db(), { marketCode: market, limit: 20 });
    return NextResponse.json(rows.map((r: any) => ({ name: r.display_name, rating: r.rating, body: r.body, reply: r.reply, country: r.country_code, verified: r.verified, at: r.created_at })));
  } catch (e) { return fail(e); }
}
export async function POST(req: Request) {
  try {
    await limit(req, 'review', 10, 3600);
    const b = await jsonBody(req);
    await verifyCaptcha(req, b.captcha);
    await submitReview(db(), { token: String(b.token || ''), displayName: String(b.name || ''), rating: Number(b.rating), body: String(b.body || ''), language: String(b.language || '') || undefined as any });
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
