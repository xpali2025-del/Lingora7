import { notFound } from 'next/navigation';
import { getOrderEmail } from '@lingora/shared';
import { db, key32 } from '@/lib/server';
import { requireUser, Shell, fmt, ActionForm, maskEmail } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { id } = await params; const { msg } = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const d = db();
  const o = (await d.query(`SELECT o.*, o.unique_amount::text amount, m.code market FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.id=$1`, [id])).rows[0];
  if (!o) notFound();
  const events = (await d.query('SELECT * FROM order_events WHERE order_id=$1 ORDER BY id', [o.id])).rows;
  const pays = (await d.query('SELECT *, amount::text amt FROM payments WHERE order_id=$1 ORDER BY id', [o.id])).rows;
  const mails = (await d.query('SELECT * FROM email_outbox WHERE order_id=$1 ORDER BY id', [o.id])).rows;
  const email = await getOrderEmail(d, o.id, key32());
  const back = `/admin/orders/${o.id}/`;
  const canSee = ['owner', 'support'].includes(user.role);
  return (
    <Shell user={user} title={`Order ${o.public_ref}`} msg={msg}>
      <table><tbody>
        <tr><th>Status</th><td>{o.status} {o.flags?.hold && <span className="tag">HOLD: {o.flags.holdReason}</span>}</td></tr>
        <tr><th>Market</th><td>{o.market}</td></tr><tr><th>Expected</th><td>{o.amount} USDT (base {o.price_usdt})</td></tr>
        <tr><th>Email</th><td>{canSee ? email || '—' : maskEmail(email)}</td></tr>
        <tr><th>Created / paid / fulfilled</th><td>{fmt(o.created_at)} / {fmt(o.paid_at)} / {fmt(o.fulfilled_at)}</td></tr>
        <tr><th>Tx</th><td className="mono">{o.tx_ref || '—'}</td></tr>
      </tbody></table>

      <h2>Actions</h2>
      <div className="row">
        <ActionForm action="order_set_email" back={back} user={user} fields={{ orderId: o.id }}><div className="row"><input name="email" type="email" placeholder="correct email" required /><button className="btn sec">Set email</button></div></ActionForm>
        {o.status === 'ready_to_fulfil' && <ActionForm action="order_fulfil" back={back} user={user} fields={{ orderId: o.id }}><button className="btn">Send code now</button></ActionForm>}
        {o.code_id && <ActionForm action="order_resend" back={back} user={user} fields={{ orderId: o.id }}><button className="btn sec">Resend code email</button></ActionForm>}
        {!o.flags?.hold ? <ActionForm action="order_hold" back={back} user={user} fields={{ orderId: o.id }}><div className="row"><input name="reason" placeholder="reason" /><button className="btn sec">Hold</button></div></ActionForm>
          : <ActionForm action="order_release" back={back} user={user} fields={{ orderId: o.id }}><button className="btn sec">Release hold</button></ActionForm>}
        {o.status === 'underpaid' && <ActionForm action="order_accept_underpaid" back={back} user={user} fields={{ orderId: o.id }}><button className="btn sec">Accept shortfall</button></ActionForm>}
        {['fulfilled', 'underpaid', 'overpaid'].includes(o.status) && <ActionForm action="refund_request" back={back} user={user} fields={{ orderId: o.id }}><div className="row"><input name="reason" placeholder="refund reason" /><button className="btn sec">Open refund</button></div></ActionForm>}
        {o.status === 'refund_requested' && <>
          <ActionForm action="refund_decide" back={back} user={user} fields={{ orderId: o.id, approve: 1 }}><label><input type="checkbox" name="voidCode" value="1" style={{ width: 'auto' }} /> void the code</label> <button className="btn">Approve refund</button></ActionForm>
          <ActionForm action="refund_decide" back={back} user={user} fields={{ orderId: o.id, approve: 0 }}><button className="btn sec">Reject refund</button></ActionForm></>}
      </div>
      <p style={{ color: 'var(--muted)' }}>Refunds are sent manually in USDT (BEP20) from the wallet; marking “approved” here records the decision and emails the customer.</p>

      <h2>Payments</h2>
      <table><thead><tr><th>Tx</th><th>Amount</th><th>Status</th><th>Detected</th></tr></thead><tbody>{pays.map((p: any) => <tr key={p.id}><td className="mono">{p.tx_hash}</td><td>{p.amt}</td><td>{p.status}</td><td>{fmt(p.detected_at)}</td></tr>)}</tbody></table>
      <h2>Emails</h2>
      <table><thead><tr><th>Template</th><th>Status</th><th>Attempts</th><th>Sent</th><th>Error</th></tr></thead><tbody>{mails.map((m: any) => <tr key={m.id}><td>{m.template}</td><td>{m.status}</td><td>{m.attempts}</td><td>{fmt(m.sent_at)}</td><td>{m.last_error}</td></tr>)}</tbody></table>
      <h2>Timeline</h2>
      <table><thead><tr><th>When</th><th>Event</th><th>By</th><th>Data</th></tr></thead><tbody>{events.map((e: any) => <tr key={e.id}><td>{fmt(e.at ?? e.created_at)}</td><td>{e.type}</td><td>{e.actor}</td><td className="mono" style={{ fontSize: '.75rem' }}>{JSON.stringify(e.data)}</td></tr>)}</tbody></table>
    </Shell>
  );
}
