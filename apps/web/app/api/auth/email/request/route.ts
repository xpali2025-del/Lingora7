import { NextResponse } from 'next/server';
import { sendLoginLink, createEmailSender, rateLimit, sha256Hex, normEmail } from '@lingora/shared';
import { db, fail, limit, jsonBody, verifyCaptcha, originOk, SITE, safeNext } from '@/lib/server';
export const dynamic = 'force-dynamic';

/** Always answers {ok:true} for a well-formed address so the form cannot be used to discover who has an account. */
export async function POST(req: Request) {
  try {
    if (!originOk(req)) return NextResponse.json({ error: 'bad_origin' }, { status: 403 });
    await limit(req, 'login_link_ip', 10, 900);
    const b = await jsonBody(req); await verifyCaptcha(req, b.captcha);
    const email = normEmail(String(b.email || ''));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
    if (!(await rateLimit(db(), 'login_link_mail:' + sha256Hex(email), 3, 900))) return NextResponse.json({ ok: true });
    const lang = String(b.lang || 'en').slice(0, 2);
    try { await sendLoginLink(db(), createEmailSender(), { email, siteUrl: SITE(), lang, nextPath: safeNext(b.next) }); }
    catch (e) { console.error('login link failed', (e as Error).message); }
    return NextResponse.json({ ok: true });
  } catch (e) { return fail(e); }
}
