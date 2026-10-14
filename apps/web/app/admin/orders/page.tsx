import { db } from '@/lib/server';
import { requireUser, Shell, fmt } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; msg?: string }> }) {
  const user = await requireUser(); const { status, q, msg } = await searchParams;
  const rows = (await db().query(
    `SELECT o.id, o.public_ref, o.status, o.unique_amount::text amount, o.created_at, o.flags, m.code market FROM orders o JOIN markets m ON m.id=o.market_id
     WHERE ($1::text IS NULL OR o.status=$1) AND ($2::text IS NULL OR o.public_ref ILIKE '%'||$2||'%') ORDER BY o.id DESC LIMIT 200`, [status || null, q || null])).rows;
  return (
    <Shell user={user} title="Orders" msg={msg}>
      <form method="get" className="row" style={{ marginBottom: 12 }}>
        <div><label>Status</label><input name="status" defaultValue={status} placeholder="e.g. ready_to_fulfil" /></div>
        <div><label>Reference</label><input name="q" defaultValue={q} placeholder="LG-…" /></div>
        <button className="btn">Filter</button>
      </form>
      <table><thead><tr><th>Ref</th><th>Market</th><th>Status</th><th>Amount</th><th>Created</th><th>Flags</th></tr></thead><tbody>
        {rows.map((r: any) => <tr key={r.id}><td><a href={`/admin/orders/${r.id}/`}>{r.public_ref}</a></td><td>{r.market}</td><td>{r.status}</td><td>{r.amount}</td><td>{fmt(r.created_at)}</td>
          <td>{r.flags?.hold ? <span className="tag">HOLD</span> : null}{r.flags?.overpaid ? <span className="tag">overpaid {r.flags.overpaid}</span> : null}</td></tr>)}
      </tbody></table>
    </Shell>
  );
}
