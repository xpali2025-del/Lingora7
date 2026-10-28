'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { type Lang, LANG_CODES, dirOf } from './i18n';
import { A, aErr } from './i18n-account';
import Captcha from './Captcha';
type Me = { customer: { email: string; name: string | null } | null; balance?: string; ledger?: any[]; orders?: any[]; google: boolean; inStock: boolean };

export default function AccountClient() {
  const [lang, setLang] = useState<Lang>('ar'); const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [cap, setCap] = useState('');
  const [token, setToken] = useState(''); const onToken = useCallback((x: string) => setCap(x), []);
  const t = A(lang);
  const load = useCallback(async () => { try { const r = await fetch('/api/me', { cache: 'no-store' }); setMe(await r.json()); } catch { setErr(A('en').e_server_error); } }, []);
  useEffect(() => {
    const q = new URLSearchParams(location.search); const l = q.get('l') as Lang; setLang(LANG_CODES.includes(l) ? l : 'ar');
    setToken(q.get('t') || ''); const e = q.get('e'); if (e) setErr(aErr(LANG_CODES.includes(l) ? l : 'ar', e));
    load();
  }, [load]);
  async function requestLink(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/auth/email/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, lang, captcha: cap, next: '/account/' }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) setSent(true); else setErr(aErr(lang, j.error));
  }
  async function confirm() {
    setBusy(true); setErr('');
    const r = await fetch('/api/auth/email/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) { history.replaceState(null, '', '/account/?l=' + lang); setToken(''); load(); } else setErr(aErr(lang, j.error));
  }
  async function signOut() { await fetch('/api/auth/logout', { method: 'POST' }); load(); }
  const dir = dirOf(lang);
  return (
    <main className="page" lang={lang} dir={dir} style={{ maxWidth: 760 }}>
      <h1>{t.accountTitle}</h1>
      {err && <p className="err" role="alert">{err}</p>}
      {!me && <p>…</p>}
      {me && !me.customer && token && (
        <section className="buy"><h2 style={{ marginTop: 0 }}>{t.confirmTitle}</h2><button className="btn" onClick={confirm} disabled={busy}>{busy ? t.confirming : t.confirmBtn}</button></section>)}
      {me && !me.customer && !token && (
        <section className="buy">
          <p>{t.signInHint}</p>
          {me.google && <p><a className="btn" href="/api/auth/google/start?type=customer&next=/account/">{t.google}</a></p>}
          {me.google && <p style={{ color: 'var(--muted)' }}>{t.or}</p>}
          {sent ? <p className="ok">{t.linkSent}</p> : (
            <form onSubmit={requestLink}>
              <div className="field"><label htmlFor="ae">{t.email}</label><input id="ae" type="email" required autoComplete="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} /></div>
              <Captcha onToken={onToken} />
              <button className="btn" disabled={busy}>{t.sendLink}</button>
            </form>)}
        </section>)}
      {me?.customer && (<>
        <p>{me.customer.email} <button className="btn sec" onClick={signOut} style={{ padding: '4px 12px' }}>{t.signOut}</button></p>
        <section className="buy"><div>{t.balance}: <span className="price">{me.balance} {t.usdt}</span></div>
          <p><Link href="/ye/#topup">{t.topupLink}</Link></p></section>
        <h2>{t.orders}</h2>
        {me.orders?.length ? <table><thead><tr><th>{t.col_order}</th><th>{t.col_market}</th><th>{t.col_status}</th><th>{t.col_date}</th></tr></thead><tbody>
          {me.orders.map((o: any) => <tr key={o.ref}><td className="mono">{o.ref}</td><td>{o.market}</td><td>{o.status}</td><td>{String(o.created_at).slice(0, 10)}</td></tr>)}</tbody></table> : <p>{t.none}</p>}
        <h2>{t.history}</h2>
        {me.ledger?.length ? <table><thead><tr><th>{t.col_date}</th><th>{t.col_type}</th><th>{t.col_amount}</th><th>{t.col_balance}</th></tr></thead><tbody>
          {me.ledger.map((l: any) => <tr key={l.id}><td>{String(l.created_at).slice(0, 10)}</td><td>{t['kind_' + l.kind] || l.kind}</td><td dir="ltr">{l.sign}{l.amount}</td><td dir="ltr">{l.balance_after}</td></tr>)}</tbody></table> : <p>{t.none}</p>}
      </>)}
    </main>
  );
}
