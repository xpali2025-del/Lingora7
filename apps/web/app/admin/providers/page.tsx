import { db } from '@/lib/server';
import { requireUser, Shell, fmt, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams;
  const rows = (await db().query('SELECT * FROM payment_providers ORDER BY id')).rows;
  return (
    <Shell user={user} title="Payment settings" msg={msg}>
      <p className="warn">API secrets are write-only: they are encrypted when saved and never shown again. Changing the receiving wallet asks for a fresh 2FA code and is audit-logged. Use a <b>read-only</b> Binance API key (no withdrawals), restricted to the worker’s static IP.</p>
      {rows.map((r: any) => {
        const c = r.public_config || {}; const live = r.type === 'binance_bep20' || r.type === 'mock';
        return (
          <section key={r.id} className="card" style={{ margin: '16px 0' }}>
            <h2 style={{ marginTop: 0 }}>{r.type} {r.enabled ? <span className="tag">enabled</span> : <span className="tag">disabled</span>}</h2>
            <p>Last test: {r.last_test_ok === null ? 'never' : r.last_test_ok ? 'OK' : 'FAILED'} {fmt(r.last_test_at)} {r.last_test_message && `— ${r.last_test_message}`} {r.test_requested_at && <i>(requested, waiting for worker)</i>}</p>
            {!live ? <p>No adapter yet (planned: webhook-based provider plugs into the same interface).</p> : (
              <ActionForm action="provider_save" back="/admin/providers/" user={user} fields={{ id: r.id }}>
                <div className="field"><label>Receiving wallet (BEP20)</label><input name="receivingAddress" defaultValue={c.receivingAddress || ''} placeholder="0x…" dir="ltr" /></div>
                <div className="field"><label>2FA code (required only when changing an existing wallet)</label><input name="totp" inputMode="numeric" autoComplete="off" /></div>
                {r.type === 'binance_bep20' && <>
                  <div className="field"><label>Detection strategy</label><select name="strategy" defaultValue={c.strategy || 'binance'}><option value="binance">A — Binance deposit history (API)</option><option value="onchain">B — BSC on-chain (RPC)</option></select></div>
                  <div className="field"><label>Binance API key (write-only)</label><input name="apiKey" autoComplete="off" placeholder={r.config_encrypted ? '•••• stored — leave empty to keep' : ''} /></div>
                  <div className="field"><label>Binance API secret (write-only)</label><input name="apiSecret" type="password" autoComplete="new-password" placeholder={r.config_encrypted ? '•••• stored — leave empty to keep' : ''} /></div>
                  <div className="field"><label>BSC RPC URL (strategy B)</label><input name="rpcUrl" defaultValue={c.rpcUrl || ''} dir="ltr" placeholder="https://…" /></div>
                  <div className="field"><label>USDT contract on BSC (verify on bscscan.com before enabling)</label><input name="usdtContract" defaultValue={c.usdtContract || ''} dir="ltr" placeholder="0x…" /></div>
                  <div className="field"><label>Required confirmations (strategy B)</label><input name="requiredConfirmations" defaultValue={c.requiredConfirmations || 15} /></div></>}
                <button className="btn">Save</button>
              </ActionForm>)}
            {live && <div className="row" style={{ marginTop: 12 }}>
              <ActionForm action="provider_test" back="/admin/providers/" user={user} fields={{ id: r.id }}><button className="btn sec">Test connection</button></ActionForm>
              <ActionForm action="provider_toggle" back="/admin/providers/" user={user} fields={{ id: r.id, enabled: r.enabled ? 0 : 1 }}><button className="btn sec">{r.enabled ? 'Disable' : 'Enable'}</button></ActionForm></div>}
          </section>);
      })}
    </Shell>
  );
}
