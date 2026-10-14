import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { logout } from '@lingora/shared';
import { db, originOk, redirectTo } from '@/lib/server';
import { COOKIE, cookieOpts } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (!originOk(req)) return new NextResponse('bad origin', { status: 403 });
  await logout(db(), (await cookies()).get(COOKIE)?.value || '');
  const res = redirectTo(req, '/admin/login/'); res.cookies.set(COOKIE, '', cookieOpts(0)); return res;
}
