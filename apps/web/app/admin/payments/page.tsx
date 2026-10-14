import { db } from '@/lib/server';
import { requireUser, Shell, fmt, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams; const d = db();
  const un = (await d.query(`SELECT *, amount::text amt FROM payments WHERE status='unmatched' ORDER BY id DESC LIMIT 100`)).rows;
  const open = (await d.query(`SELECT id, public_ref, status, unique_amount::text amt, expires_at FROM orders WHERE status IN ('awaiting_payment','expired','underpaid') AND created_at > now() - interval '7 days' ORDER BY id DESC LIMIT 100`)).rows;
  const recent = (await d.query(`SELECT p.*, p.amount::text amt, o.public_ref FROM payments p LEFT JOIN orders o ON o.id=p.order_id WHERE p.status<>'unmatched' ORDER BY p.id DESC LIMIT 50`)).rows;
  return (
    <Shell user={user} title="Payments" msg={msg}>
      <h2>Unmatched payments ({un.length})</h2>
      <p style={{ color: 'var(--muted)' }}>Late payments (order expired), wrong amounts, or deposits with no matching order. Wrong-asset/wrong-network deposits are never auto-credited.</p>
      <table><thead><tr><th>Tx</th><th>Amount</th><th>Detected</th><th>Resolve</th></tr></thead><tbody>
        {un.map((p: any) => <tr key={p.id}><td className="mono">{p.tx_hash}</td><td>{p.amt} {p.asset}</td><td>{fmt(p.detected_at)}</td><td>
          <ActionForm action="payment_match" back="/admin/payments/" user={user} fields={{ paymentId: p.id }} inline>
            <select name="orderId" required style={{ width: 'auto' }}><option value="">match to order…</option>{open.map((o: any) => <option key={o.id} value={o.id}>{o.public_ref} · {o.amt} · {o.status}</option>)}</select> <button className="btn sec">Match</button></ActionForm>{' '}
          <ActionForm action="payment_ignore" back="/admin/payments/" user={user} fields={{ paymentId: p.id, status: 'ignored' }} inline><button className="btn sec">Ignore</button></ActionForm>{' '}
          <ActionForm action="payment_ignore" back="/admin/payments/" user={user} fields={{ paymentId: p.id, status: 'refunded' }} inline><button className="btn sec">Mark refunded</button></ActionForm></td></tr>)}
      </tbody></table>
      <h2>Recent payments</h2>
      <table><thead><tr><th>Tx</th><th>Amount</th><th>Status</th><th>Order</th><th>Detected</th></tr></thead><tbody>
        {recent.map((p: any) => <tr key={p.id}><td className="mono">{p.tx_hash}</td><td>{p.amt}</td><td>{p.status}</td><td>{p.public_ref || '—'}</td><td>{fmt(p.detected_at)}</td></tr>)}
      </tbody></table>
    </Shell>
  );
}
