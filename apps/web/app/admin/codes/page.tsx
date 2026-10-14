import { stockCounts } from '@lingora/shared';
import { db } from '@/lib/server';
import { requireUser, Shell, fmt, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams; const d = db();
  const s = await stockCounts(d);
  const batches = (await d.query('SELECT * FROM code_batches ORDER BY id DESC LIMIT 30')).rows;
  const avail = (await d.query(`SELECT id, batch_id FROM codes WHERE status='available' ORDER BY id LIMIT 30`)).rows;
  return (
    <Shell user={user} title="Code inventory" msg={msg}>
      <p>Available <b>{s.available}</b> · reserved {s.reserved} · sold {s.sold} · void {s.void}. Links are stored encrypted and are never displayed here.</p>
      <h2>Import links</h2>
      <ActionForm action="codes_import" back="/admin/codes/" user={user}>
        <div className="field"><label>Source / supplier label</label><input name="source" placeholder="e.g. supplier-A" /></div>
        <div className="field"><label>One https:// redeem link per line (or first CSV column)</label><textarea name="text" rows={8} style={{ maxWidth: '100%' }} required /></div>
        <button className="btn">Import</button>
      </ActionForm>
      <h2>Batches</h2>
      <table><thead><tr><th>#</th><th>Source</th><th>Count</th><th>Imported</th><th>By</th></tr></thead><tbody>{batches.map((b: any) => <tr key={b.id}><td>{b.id}</td><td>{b.source}</td><td>{b.count}</td><td>{fmt(b.imported_at)}</td><td>{b.imported_by}</td></tr>)}</tbody></table>
      <h2>Next available (void a bad link)</h2>
      <table><tbody>{avail.map((c: any) => <tr key={c.id}><td>code #{c.id}</td><td>batch {c.batch_id}</td><td><ActionForm action="code_void" back="/admin/codes/" user={user} fields={{ codeId: c.id }} inline><button className="btn sec">Void</button></ActionForm></td></tr>)}</tbody></table>
    </Shell>
  );
}
