import { getSetting, defaultStrings, LANGS } from '@lingora/shared';
import { db } from '@/lib/server';
import { requireUser, Shell, fmt, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
const TEMPLATES = ['code_delivered', 'review_invitation', 'order_received', 'refund_approved', 'refund_rejected'];
const FIELDS = ['subject', 'intro', 'linkLabel', 'stepsTitle', 'note', 'support', 'button', 'optout'];
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string; t?: string; l?: string }> }) {
  const user = await requireUser(); const { msg, t, l } = await searchParams; const d = db();
  const tpl = TEMPLATES.includes(t || '') ? t! : 'code_delivered', lang = (LANGS as string[]).includes(l || '') ? l! : 'en';
  const ov = (await getSetting(d, `email_template:${tpl}:${lang}`, null)) || {};
  const base: any = defaultStrings(tpl, lang);
  const out = (await d.query(`SELECT e.*, o.public_ref FROM email_outbox e JOIN orders o ON o.id=e.order_id ORDER BY e.id DESC LIMIT 60`)).rows;
  return (
    <Shell user={user} title="Emails" msg={msg}>
      <h2>Outbox</h2>
      <table><thead><tr><th>Order</th><th>Template</th><th>Status</th><th>Tries</th><th>Next/sent</th><th>Error</th><th /></tr></thead><tbody>
        {out.map((e: any) => <tr key={e.id}><td><a href={`/admin/orders/${e.order_id}/`}>{e.public_ref}</a></td><td>{e.template}</td><td>{e.status}</td><td>{e.attempts}</td><td>{fmt(e.sent_at || e.next_attempt_at)}</td><td>{e.last_error}</td>
          <td>{['failed', 'cancelled'].includes(e.status) && <ActionForm action="outbox_retry" back="/admin/emails/" user={user} fields={{ id: e.id }} inline><button className="btn sec">Retry</button></ActionForm>}</td></tr>)}
      </tbody></table>
      <h2>Templates</h2>
      <form method="get" className="row"><select name="t" defaultValue={tpl} style={{ width: 'auto' }}>{TEMPLATES.map(x => <option key={x}>{x}</option>)}</select>
        <select name="l" defaultValue={lang} style={{ width: 'auto' }}>{(LANGS as string[]).map(x => <option key={x}>{x}</option>)}</select><button className="btn sec">Load</button></form>
      {lang !== 'ar' && lang !== 'en' && <p className="warn">Non-Arabic/English templates are machine-drafted starting points: have a native speaker review them before enabling that market.</p>}
      <ActionForm action="template_save" back={`/admin/emails/?t=${tpl}&l=${lang}`} user={user} fields={{ template: tpl, lang }}>
        {FIELDS.filter(f => typeof base?.[f] === 'string').map(f => <div className="field" key={f}><label>{f}</label><input name={f} defaultValue={(ov as any)[f] || ''} placeholder={base[f]} style={{ maxWidth: '100%' }} /></div>)}
        <p style={{ color: 'var(--muted)' }}>Leave a field empty to use the default shown as placeholder. Keep {'{ref}'} in subjects.</p><button className="btn">Save overrides</button>
      </ActionForm>
    </Shell>
  );
}
