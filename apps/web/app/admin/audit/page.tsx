import { db } from '@/lib/server';
import { requireUser, Shell, fmt } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const user = await requireUser();
  const rows = (await db().query('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300')).rows;
  return (
    <Shell user={user} title="Audit log">
      <table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>IP</th><th>Data</th></tr></thead><tbody>
        {rows.map((r: any) => <tr key={r.id}><td>{fmt(r.at)}</td><td>{r.actor}</td><td>{r.action}</td><td>{r.target}</td><td>{r.ip}</td><td className="mono" style={{ fontSize: '.75rem' }}>{JSON.stringify(r.data)}</td></tr>)}
      </tbody></table>
    </Shell>
  );
}
