import { ROLES } from '@lingora/shared';
import { db } from '@/lib/server';
import { requireUser, Shell, fmt, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams;
  const rows = (await db().query('SELECT id,email,role,last_login_at,locked_until FROM admin_users ORDER BY id')).rows;
  return (
    <Shell user={user} title="Users & security" msg={msg}>
      <table><thead><tr><th>Email</th><th>Role</th><th>Last login</th><th /></tr></thead><tbody>
        {rows.map((u: any) => <tr key={u.id}><td>{u.email}</td><td>{u.role}</td><td>{fmt(u.last_login_at)}</td><td>{u.locked_until && new Date(u.locked_until) > new Date() ? <span className="tag">locked/disabled</span> : u.id !== user.id && <ActionForm action="user_disable" back="/admin/users/" user={user} fields={{ id: u.id }} inline><button className="btn sec">Disable</button></ActionForm>}</td></tr>)}
      </tbody></table>
      <p style={{ color: 'var(--muted)' }}>Roles — owner: everything · support: orders, payments, codes, reviews · editor: reviews and email templates · analyst: read-only.</p>
      <h2>Add user</h2>
      <ActionForm action="user_create" back="/admin/users/" user={user}>
        <div className="field"><label>Email</label><input name="email" type="email" required /></div>
        <div className="field"><label>Temporary password (12+ chars)</label><input name="password" type="password" minLength={12} required autoComplete="new-password" /></div>
        <div className="field"><label>Role</label><select name="role">{(ROLES as string[]).map(r => <option key={r}>{r}</option>)}</select></div>
        <button className="btn">Create (2FA secret is shown once)</button>
      </ActionForm>
      <h2>Add a Google user</h2>
      <ActionForm action="user_create_google" back="/admin/users/" user={user}>
        <div className="field"><label>Google e-mail (they sign in with “Continue with Google”, no password)</label><input name="email" type="email" required /></div>
        <div className="field"><label>Role</label><select name="role">{(ROLES as string[]).map(r => <option key={r}>{r}</option>)}</select></div>
        <button className="btn">Add</button>
      </ActionForm>
      <h2>Change my password</h2>
      <ActionForm action="password_change" back="/admin/users/" user={user}>
        <div className="field"><label>Current</label><input name="current" type="password" required autoComplete="current-password" /></div>
        <div className="field"><label>New (12+ chars)</label><input name="next" type="password" minLength={12} required autoComplete="new-password" /></div>
        <button className="btn sec">Change</button>
      </ActionForm>
    </Shell>
  );
}
