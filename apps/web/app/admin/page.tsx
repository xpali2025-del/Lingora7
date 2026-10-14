import { stockCounts, getSetting } from '@lingora/shared';
import { db } from '@/lib/server';
import { requireUser, Shell } from '@/lib/admin';
export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams;
  const d = db();
  const by = (await d.query(`SELECT status, count(*)::int n FROM orders GROUP BY status ORDER BY n DESC`)).rows;
  const stock = await stockCounts(d);
  const hb = Number(await getSetting(d, 'worker_heartbeat', 0));
  const age = hb ? Math.round((Date.now() - hb) / 1000) : null;
  const un = (await d.query(`SELECT count(*)::int n FROM payments WHERE status='unmatched'`)).rows[0].n;
  const failed = (await d.query(`SELECT count(*)::int n FROM email_outbox WHERE status='failed'`)).rows[0].n;
  const today = (await d.query(`SELECT count(*)::int n, COALESCE(sum(price_usdt),0)::text s FROM orders WHERE status='fulfilled' AND fulfilled_at > now() - interval '24 hours'`)).rows[0];
  const prov = (await d.query(`SELECT type, enabled, last_test_ok, last_test_at FROM payment_providers ORDER BY id`)).rows;
  const mode = await getSetting(d, 'fulfilment_mode', 'manual');
  return (
    <Shell user={user} title="Overview" msg={msg}>
      {(age === null || age > 120) && <p className="warn"><b>Worker is not running</b> {age === null ? '(never started)' : `(last heartbeat ${age}s ago)`}. Payments are not being detected.</p>}
      {un > 0 && <p className="warn">{un} unmatched payment(s) need attention — <a href="/admin/payments/">open queue</a>.</p>}
      {failed > 0 && <p className="warn">{failed} email(s) failed permanently — <a href="/admin/emails/">review</a>.</p>}
      {stock.available < Number(await getSetting(d, 'low_stock_threshold', 5)) && <p className="warn">Low stock: {stock.available} codes available.</p>}
      <div className="grid quad">
        <div className="card"><h3>Delivered, last 24h</h3><p>{today.n} orders · {Number(today.s).toFixed(2)} USDT</p></div>
        <div className="card"><h3>Stock</h3><p>{stock.available} available · {stock.reserved} reserved · {stock.sold} sold · {stock.void} void</p></div>
        <div className="card"><h3>Fulfilment mode</h3><p>{mode}</p></div>
        <div className="card"><h3>Worker</h3><p>{age === null ? 'never' : `${age}s ago`}</p></div>
      </div>
      <h2>Orders by status</h2>
      <table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{by.map((r: any) => <tr key={r.status}><td><a href={`/admin/orders/?status=${r.status}`}>{r.status}</a></td><td>{r.n}</td></tr>)}</tbody></table>
      <h2>Payment providers</h2>
      <table><thead><tr><th>Provider</th><th>Enabled</th><th>Last test</th></tr></thead><tbody>{prov.map((r: any) => <tr key={r.type}><td>{r.type}</td><td>{r.enabled ? 'yes' : 'no'}</td><td>{r.last_test_ok === null ? '—' : r.last_test_ok ? 'ok' : 'FAILED'}</td></tr>)}</tbody></table>
    </Shell>
  );
}
