import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession, runAction, AdminError, CommerceError } from '@lingora/shared';
import { db, key32, clientIp, originOk, redirectTo } from '@/lib/server';
import { COOKIE } from '@/lib/admin';
import { revalidatePath } from 'next/cache';
export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function back(req: Request, to: string, msg: string) {
  const path = to.startsWith('/admin/') ? to : '/admin/';
  const u = new URL(path, 'http://x'); u.searchParams.set('msg', msg);
  return redirectTo(req, u.pathname + u.search);
}
export async function POST(req: Request) {
  // CSRF: cookie is SameSite=Strict; additionally require a same-origin Origin header.
  if (!originOk(req)) return new NextResponse('bad origin', { status: 403 });
  const form = await req.formData();
  const p: Record<string, string> = {}; form.forEach((v, k) => { if (typeof v === 'string') p[k] = v; });
  const to = p._back || '/admin/';
  const user = await getSession(db(), (await cookies()).get(COOKIE)?.value || '');
  if (!user) return redirectTo(req, '/admin/login/');
  try {
    const r: any = await runAction(db(), user, p._action, p, { key32: key32(), ip: clientIp(req) });
    if (['review_moderate', 'market_save', 'contact_save'].includes(p._action)) {   // refresh the statically generated market pages right away
      revalidatePath('/[locale]/[[...path]]', 'page');
      if (p._action === 'contact_save') revalidatePath('/', 'layout');
    }
    if (r && typeof r === 'object' && r.totpSecret) {   // shown once, never put in a URL
      return new NextResponse(`<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>User created</title><body style="font-family:system-ui;max-width:40em;margin:3em auto"><h1>User created</h1><p>Give the user this authenticator secret once (it cannot be shown again):</p><pre>${esc(r.totpSecret)}</pre><p>otpauth URL:</p><pre style="white-space:pre-wrap">${esc(r.otpauth)}</pre><p><a href="/admin/users/">Back</a></p>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    }
    return back(req, to, typeof r === 'string' ? r : 'done');
  } catch (e: any) {
    if (e instanceof AdminError || e instanceof CommerceError) return back(req, to, 'Error: ' + e.code);
    console.error('admin action failed', p._action, e);
    return back(req, to, 'Error: server_error');
  }
}
