import { db } from '@/lib/server';
import { getSetting } from '@lingora/shared';
import { getContact, SOCIALS } from '@/lib/data';
import { requireUser, Shell, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
const TXT: [string, string, string][] = [
  ['legal_name', 'Legal entity name', 'e.g. Lingora Ltd'], ['hours_ar', 'Opening hours (Arabic)', 'يوميًا 10 ص – 10 م'], ['hours_en', 'Opening hours (English)', 'Daily 10:00–22:00'],
  ['address_ar', 'Address (Arabic)', ''], ['address_en', 'Address (English)', ''],
];
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requireUser(); const { msg } = await searchParams; const c: any = await getContact();
  const ye: { title: string; lines: string[] }[] = await getSetting(db(), 'ye_payment_methods', []).catch(() => []);
  const yeText = ye.map(b => [b.title, ...b.lines].join('\n')).join('\n\n');
  return (
    <Shell user={user} title="Contact & social" msg={msg}>
      <p>These details appear in the site footer, the About pages and the Organization markup. Leave a field empty to hide it. Social links must start with https://.</p>
      <ActionForm action="contact_save" back="/admin/contact/" user={user}>
        <div className="field"><label>Company e-mail (shown publicly)</label><input name="email" type="email" defaultValue={c.email} style={{ maxWidth: '100%' }} /></div>
        <div className="field"><label>WhatsApp number (digits with country code, e.g. 201001234567)</label><input name="whatsapp" defaultValue={c.whatsapp} dir="ltr" style={{ maxWidth: '100%' }} /></div>
        {SOCIALS.map(([k, name]) => <div className="field" key={k}><label>{name} URL</label><input name={k} defaultValue={c[k]} dir="ltr" placeholder="https://" style={{ maxWidth: '100%' }} /></div>)}
        {TXT.map(([k, label, ph]) => <div className="field" key={k}><label>{label}</label><input name={k} defaultValue={c[k]} placeholder={ph} style={{ maxWidth: '100%' }} /></div>)}
        <button className="btn">Save</button>
      </ActionForm>
      <h2>Yemen payment accounts</h2>
      <p>Shown on the Yemen page (<code>/ye/</code>). One block per method; the first line of a block is its title, the other lines are shown as they are. Separate blocks with an empty line. Kept in the database only, never in the code repository.</p>
      <ActionForm action="yemen_payments_save" back="/admin/contact/" user={user}>
        <div className="field"><textarea name="text" rows={14} defaultValue={yeText} dir="auto" style={{ maxWidth: '100%', width: '100%' }} /></div>
        <button className="btn">Save</button>
      </ActionForm>
      {user.role !== 'owner' && <p className="warn">Only the owner can edit these details.</p>}
    </Shell>
  );
}
