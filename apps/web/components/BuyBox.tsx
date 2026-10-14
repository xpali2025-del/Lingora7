'use client';
import { useState, useCallback } from 'react';
import { T, type Lang } from './i18n';
import Captcha from './Captcha';

export default function BuyBox({ market, lang, price }: { market: string; lang: Lang; price: number }) {
  const t = T[lang]; const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [cap, setCap] = useState('');
  const onToken = useCallback((x: string) => setCap(x), []);
  async function go() {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ market, captcha: cap }) });
      const j = await r.json();
      if (!r.ok) { setErr(t.errors[j.error] || t.errors.server_error); setBusy(false); return; }
      // The order key travels in the URL fragment so it is never sent to servers, logs or referrers.
      location.href = `/order/?ref=${encodeURIComponent(j.ref)}&l=${lang}#k=${encodeURIComponent(j.key)}`;
    } catch { setErr(t.errors.server_error); setBusy(false); }
  }
  return (
    <section className="buy" aria-label={t.buy}>
      <div>{t.priceLabel}: <span className="price">{price} USDT</span></div>
      <p style={{ margin: '4px 0 12px', color: 'var(--muted)' }}>{t.net}</p>
      <Captcha onToken={onToken} />
      <button className="btn" onClick={go} disabled={busy}>{busy ? t.buying : t.buy}</button>
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}
