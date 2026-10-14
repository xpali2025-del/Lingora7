import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getSession, can } from '@lingora/shared';
import { db } from './server';

export const COOKIE = 'lw_admin';
export const cookieOpts = (maxAge: number) => ({ httpOnly: true, sameSite: 'strict' as const, secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1', path: '/admin', maxAge });

export async function requireUser(): Promise<{ id: number; email: string; role: string }> {
  const token = (await cookies()).get(COOKIE)?.value;
  const u = await getSession(db(), token || '');
  if (!u) redirect('/admin/login/');
  return u;
}
export const fmt = (d: unknown) => (d ? new Date(d as string).toISOString().replace('T', ' ').slice(0, 19) : '—');

const NAV: [string, string][] = [['/admin/', 'Overview'], ['/admin/orders/', 'Orders'], ['/admin/payments/', 'Payments'], ['/admin/codes/', 'Codes'], ['/admin/providers/', 'Payment settings'],
  ['/admin/markets/', 'Markets & settings'], ['/admin/contact/', 'Contact & social'], ['/admin/reviews/', 'Reviews'], ['/admin/emails/', 'Emails'], ['/admin/users/', 'Users'], ['/admin/audit/', 'Audit log']];

export function Shell({ user, title, msg, children }: { user: { email: string; role: string }; title: string; msg?: string; children: ReactNode }) {
  return (
    <div className="adm" dir="ltr" lang="en">
      <nav>{NAV.map(([h, l]) => <Link key={h} href={h}>{l}</Link>)}
        <span style={{ marginInlineStart: 'auto' }}>{user.email} <span className="tag">{user.role}</span>{' '}
          <form className="inline" method="post" action="/admin/logout/"><button className="btn sec" style={{ padding: '4px 12px' }}>Log out</button></form></span></nav>
      <h1>{title}</h1>
      {msg && <p className="warn" role="status">{msg}</p>}
      {children}
    </div>
  );
}
/** A POST form to the audited action endpoint. Hidden fields carry the action name and where to return. */
export function ActionForm({ action, back, user, fields = {}, children, inline = false }: { action: string; back: string; user: { role: string }; fields?: Record<string, string | number>; children: ReactNode; inline?: boolean }) {
  if (!can(user.role, action)) return null;
  return (
    <form method="post" action="/admin/action/" className={inline ? 'inline' : undefined}>
      <input type="hidden" name="_action" value={action} /><input type="hidden" name="_back" value={back} />
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />)}
      {children}
    </form>
  );
}
export const maskEmail = (e: string | null) => (e ? e.replace(/^(.).*(@.*)$/, '$1***$2') : '—');
