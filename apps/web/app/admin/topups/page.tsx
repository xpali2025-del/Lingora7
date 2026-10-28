import { db } from '@/lib/server';
import { listTopups } from '@lingora/shared';
import { requireUser, Shell, fmt, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams;
  const rows = await listTopups(db(), { limit: 100 });
  const wallets = (await db().query(`SELECT c.email, w.balance::text AS balance, w.updated_at FROM wallets w JOIN customers c ON c.id=w.customer_id ORDER BY w.updated_at DESC LIMIT 50`)).rows;
  const wa = (c: string) => { const d = String(c).replace(/[^\d]/g, ''); return d.length >= 7 ? `https://wa.me/${d}` : null; };
  return (
    <Shell user={user} title="Top-ups & wallets" msg={msg}>
      <p className="warn">A customer who cannot pay in USDT asks for a top-up. Contact them (WhatsApp link below), confirm the money reached your account, then press <b>Credit</b> with the USDT amount you agreed. Nothing is added automatically.</p>
      <h2>Requests</h2>
      <table><thead><tr><th>#</th><th>When</th><th>Customer</th><th>Contact</th><th>Method / amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {rows.map((r: any) => (
          <tr key={r.id}><td>{r.id}</td><td>{fmt(r.created_at)}</td><td>{r.name || '—'}<br />{r.email}</td>
            <td>{wa(r.contact) ? <a href={wa(r.contact)!} rel="noopener nofollow" target="_blank">{r.contact}</a> : r.contact}</td>
            <td>{r.method}<br />{r.amount_hint}{r.note && <><br /><i>{r.note}</i></>}</td><td><span className="tag">{r.status}</span></td>
            <td>{r.status === 'pending' && (<>
              <ActionForm action="topup_resolve" back="/admin/topups/" user={user} fields={{ id: r.id, op: 'credit' }} inline>
                <input name="amount" placeholder="USDT" size={6} dir="ltr" required style={{ width: 90 }} /> <button className="btn">Credit</button></ActionForm>{' '}
              <ActionForm action="topup_resolve" back="/admin/topups/" user={user} fields={{ id: r.id, op: 'reject' }} inline><button className="btn sec">Reject</button></ActionForm></>)}</td></tr>))}
        {!rows.length && <tr><td colSpan={7}>No requests yet.</td></tr>}
      </tbody></table>
      <h2>Add or remove balance manually</h2>
      <ActionForm action="wallet_credit" back="/admin/topups/" user={user}>
        <div className="row"><div className="field"><label>Customer e-mail</label><input name="email" type="email" required /></div>
          <div className="field"><label>Amount (USDT)</label><input name="amount" required dir="ltr" /></div>
          <div className="field"><label>Note</label><input name="note" /></div><button className="btn">Credit</button></div>
      </ActionForm>
      <ActionForm action="wallet_debit" back="/admin/topups/" user={user}>
        <div className="row"><div className="field"><label>Customer e-mail</label><input name="email" type="email" required /></div>
          <div className="field"><label>Amount (USDT)</label><input name="amount" required dir="ltr" /></div>
          <div className="field"><label>Note</label><input name="note" /></div><button className="btn sec">Debit</button></div>
      </ActionForm>
      <h2>Wallets</h2>
      <table><thead><tr><th>Customer</th><th>Balance (USDT)</th><th>Updated</th></tr></thead><tbody>
        {wallets.map((w: any) => <tr key={w.email}><td>{w.email}</td><td>{Number(w.balance).toFixed(2)}</td><td>{fmt(w.updated_at)}</td></tr>)}
        {!wallets.length && <tr><td colSpan={3}>No wallets yet.</td></tr>}
      </tbody></table>
    </Shell>
  );
}
