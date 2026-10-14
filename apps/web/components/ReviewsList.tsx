import type { PubReview } from '@/lib/data';
import { T, type Lang } from './i18n';
/** Server-rendered, so approved reviews are in the HTML that search engines index. */
export default function ReviewsList({ reviews, lang }: { reviews: PubReview[]; lang: Lang }) {
  const t = T[lang];
  return (
    <section aria-label={t.reviews}>
      <h2>{t.reviews}</h2>
      {!reviews.length && <p>{t.noReviews}</p>}
      {reviews.map((r, i) => (
        <div className="rev" key={i}>
          <div><b>{r.name}</b>{r.country ? ` · ${r.country}` : ''} · <span aria-label={`${r.rating}/5`}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span><span className="tag" style={{ marginInlineStart: 8 }}>{t.verified}</span></div>
          <p>{r.body}</p>{r.reply && <p style={{ color: 'var(--muted)' }}>↳ {r.reply}</p>}
        </div>))}
    </section>
  );
}
