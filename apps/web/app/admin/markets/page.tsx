import { getSetting } from '@lingora/shared';
import { db } from '@/lib/server';
import { requireUser, Shell, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams; const d = db();
  const rows = (await d.query('SELECT *, price_usdt::text p FROM markets ORDER BY id')).rows;
  const S = async (k: string, f: unknown) => String(await getSetting(d, k, f));
  const wallets = (await getSetting(d, 'flagged_wallets', [])).join('\n');
  const settings: [string, string][] = [['fulfilment_mode', await S('fulfilment_mode', 'manual')], ['order_expiry_minutes', await S('order_expiry_minutes', 30)], ['low_stock_threshold', await S('low_stock_threshold', 5)], ['review_invite_days', await S('review_invite_days', 3)]];
  return (
    <Shell user={user} title="Markets & settings" msg={msg}>
      <h2>Global settings</h2>
      <table><tbody>{settings.map(([k, v]) => <tr key={k}><th>{k}</th><td><ActionForm action="setting_save" back="/admin/markets/" user={user} fields={{ key: k }} inline>
        {k === 'fulfilment_mode' ? <select name="value" defaultValue={v} style={{ width: 'auto' }}><option>manual</option><option>auto</option></select> : <input name="value" defaultValue={v} style={{ width: 120 }} />} <button className="btn sec">Save</button></ActionForm></td></tr>)}</tbody></table>
      <p style={{ color: 'var(--muted)' }}>manual = an operator presses “Send code”. auto = the code is emailed as soon as the customer submits their email (held orders are always manual).</p>
      <h2>Markets</h2>
      <p className="warn">Changing a price here changes what checkout charges. Update the visible page copy so both match.</p>
      <table><thead><tr><th>Market</th><th>Price (USDT)</th><th>Enabled</th><th>Status</th><th>Fulfilment</th><th /></tr></thead><tbody>
        {rows.map((m: any) => <tr key={m.id}>
          <td>{m.code}</td>
          <td colSpan={5}><ActionForm action="market_save" back="/admin/markets/" user={user} fields={{ id: m.id }}><div className="row">
            <input name="price" defaultValue={Number(m.p)} style={{ width: 90 }} />
            <select name="enabled" defaultValue={m.enabled ? '1' : '0'} style={{ width: 'auto' }}><option value="1">enabled</option><option value="0">disabled</option></select>
            <select name="status" defaultValue={m.status} style={{ width: 'auto' }}><option>live</option><option>draft</option></select>
            <select name="fulfilmentMode" defaultValue={m.fulfilment_mode || ''} style={{ width: 'auto' }}><option value="">global</option><option>manual</option><option>auto</option></select>
            <button className="btn sec">Save</button></div></ActionForm></td></tr>)}
      </tbody></table>
      <h2>Wallet watch-list</h2>
      <p>Orders paid from these sender addresses are held for manual review (one per line).</p>
      <ActionForm action="wallets_save" back="/admin/markets/" user={user}><textarea name="wallets" rows={5} defaultValue={wallets} dir="ltr" style={{ maxWidth: '100%' }} /><br /><button className="btn sec">Save list</button></ActionForm>
    </Shell>
  );
}
