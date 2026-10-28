'use client';
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { T, type Lang } from './i18n';
import { A, aErr } from './i18n-account';
import Captcha from './Captcha';

export default function BuyBox({ market, lang, price, inStock = true }: { market: string; lang: Lang; price: number; inStock?: boolean }) {
  const t = T[lang]; const a = A(lang); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [cap, setCap] = useState('');
  const [me, setMe] = useState<{ customer: { email: string } | null; balance?: string; inStock?: boolean } | null>(null);
  const onToken = useCallback((x: string) => setCap(x), []);
  useEffect(() => { fetch('/api/me', { cache: 'no-store' }).then(r => r.json()).then(setMe).catch(() => setMe(null)); }, []);
  const available = inStock && (me?.inStock ?? true);
  const msg = (code: string) => t.errors[code] || aErr(lang, code);
  async function go() {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ market, captcha: cap }) });
      const j = await r.json();
      if (!r.ok) { setErr(msg(j.error)); setBusy(false); return; }
      // The order key travels in the URL fragment so it is never sent to servers, logs or referrers.
      location.href = `/order/?ref=${encodeURIComponent(j.ref)}&l=${lang}#k=${encodeURIComponent(j.key)}`;
    } catch { setErr(t.errors.server_error); setBusy(false); }
  }
  async function goBalance() {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/orders/from-balance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ market }) });
      const j = await r.json();
      if (!r.ok) { setErr(msg(j.error)); setBusy(false); return; }
      location.href = `/order/?ref=${encodeURIComponent(j.ref)}&l=${lang}#k=${encodeURIComponent(j.key)}`;
    } catch { setErr(t.errors.server_error); setBusy(false); }
  }
  const enough = me?.customer && Number(me.balance) >= price;
  return (
    <section className="buy" aria-label={t.buy}>
      <div>{t.priceLabel}: <span className="price">{price} USDT</span></div>
      <p style={{ margin: '4px 0 12px', color: 'var(--muted)' }}>{t.net}</p>
      {!available ? <p className="err" role="status">{a.outOfStock}</p> : (<>
        <Captcha onToken={onToken} />
        <button className="btn" onClick={go} disabled={busy}>{busy ? t.buying : t.buy}</button>
        {me?.customer && (
          <p style={{ marginTop: 14 }}>
            {a.balanceNow}: <b dir="ltr">{me.balance} USDT</b>{' '}
            {enough ? <button className="btn sec" onClick={goBalance} disabled={busy}>{a.payFromBalance}</button> : <span style={{ color: 'var(--muted)' }}>{a.notEnough}</span>}
          </p>)}
        {me && !me.customer && <p style={{ marginTop: 14 }}><Link href={`/account/?l=${lang}`}>{a.signInToUse}</Link></p>}
      </>)}
      {err && <p className="err" role="alert">{err}</p>}
    </section>
  );
}
