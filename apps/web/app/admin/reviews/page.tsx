import { db } from '@/lib/server';
import { requireUser, Shell, fmt, ActionForm } from '@/lib/admin';
export const dynamic = 'force-dynamic';
export default async function Page({ searchParams }: { searchParams: Promise<{ msg?: string; s?: string }> }) {
  const user = await requireUser(); const { msg, s } = await searchParams; const status = ['pending', 'approved', 'rejected'].includes(s || '') ? s! : 'pending';
  const rows = (await db().query(`SELECT r.*, m.code market FROM reviews r JOIN markets m ON m.id=r.market_id WHERE r.status=$1 ORDER BY r.id DESC LIMIT 100`, [status])).rows;
  const back = `/admin/reviews/?s=${status}`;
  return (
    <Shell user={user} title="Reviews" msg={msg}>
      <p>{['pending', 'approved', 'rejected'].map(x => <a key={x} href={`/admin/reviews/?s=${x}`} style={{ marginInlineEnd: 12, fontWeight: x === status ? 700 : 400 }}>{x}</a>)}</p>
      <p style={{ color: 'var(--muted)' }}>Reviews come only from verified buyers via their private link. There is deliberately no way to create a review here.</p>
      {rows.map((r: any) => (
        <section key={r.id} className="card" style={{ margin: '12px 0' }}>
          <b>{r.display_name}</b> · {r.market} · {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)} · {fmt(r.created_at)} {r.featured && <span className="tag">featured</span>} {r.edited && <span className="tag">edited</span>}
          <p dir="auto">{r.body}</p>{r.reply && <p style={{ color: 'var(--muted)' }}>Reply: {r.reply}</p>}
          <div className="row">
            {r.status !== 'approved' && <ActionForm action="review_moderate" back={back} user={user} fields={{ reviewId: r.id, op: 'approve' }}><button className="btn">Approve</button></ActionForm>}
            {r.status !== 'rejected' && <ActionForm action="review_moderate" back={back} user={user} fields={{ reviewId: r.id, op: 'reject' }}><button className="btn sec">Reject</button></ActionForm>}
            <ActionForm action="review_moderate" back={back} user={user} fields={{ reviewId: r.id, op: r.featured ? 'unfeature' : 'feature' }}><button className="btn sec">{r.featured ? 'Unfeature' : 'Feature'}</button></ActionForm>
            <ActionForm action="review_moderate" back={back} user={user} fields={{ reviewId: r.id, op: 'reply' }}><div className="row"><input name="reply" placeholder="public reply" /><button className="btn sec">Reply</button></div></ActionForm>
            <ActionForm action="review_moderate" back={back} user={user} fields={{ reviewId: r.id, op: 'redact' }}><div className="row"><input name="body" defaultValue={r.body} /><button className="btn sec">Redact (personal data only)</button></div></ActionForm>
          </div>
        </section>))}
    </Shell>
  );
}
