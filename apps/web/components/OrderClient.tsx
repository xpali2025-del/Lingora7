'use client';
import { useEffect, useState, useCallback } from 'react';
import { T, type Lang, LANG_CODES, dirOf } from './i18n';
type O = { ref: string; status: string; amount: string; address: string; network: string; asset: string; expiresAt: string; emailSubmitted: boolean; delivered: boolean };
const POLL = ['awaiting_payment', 'paid_unconfirmed', 'paid', 'awaiting_email', 'ready_to_fulfil'];

function Inner({ lang }: { lang: Lang }) {
  const t = T[lang]; const o_ = t.order;
  const [o, setO] = useState<O | null>(null); const [err, setErr] = useState(''); const [left, setLeft] = useState(0);
  const [em, setEm] = useState(''); const [em2, setEm2] = useState(''); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState('');
  const [creds, setCreds] = useState<{ ref: string; key: string } | null>(null);

  useEffect(() => {
    const ref = new URLSearchParams(location.search).get('ref') || '';
    const key = new URLSearchParams(location.hash.slice(1)).get('k') || '';
    if (!ref || !key) setErr(t.errors.not_found); else setCreds({ ref, key });
  }, [t]);
  const load = useCallback(async () => {
    if (!creds) return;
    try {
      const r = await fetch(`/api/orders/${encodeURIComponent(creds.ref)}`, { headers: { 'x-order-key': creds.key }, cache: 'no-store' });
      const j = await r.json(); if (!r.ok) { setErr(t.errors[j.error] || t.errors.server_error); return; }
      setErr(''); setO(j);
    } catch { /* transient: keep polling */ }
  }, [creds, t]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!o || !POLL.includes(o.status)) return; const id = setInterval(load, 8000); return () => clearInterval(id); }, [o, load]);
  useEffect(() => {
    if (!o) return; const tick = () => setLeft(Math.max(0, Math.floor((new Date(o.expiresAt).getTime() - Date.now()) / 1000)));
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id);
  }, [o]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!creds) return; setBusy(true); setErr('');
    const r = await fetch(`/api/orders/${encodeURIComponent(creds.ref)}/email`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-order-key': creds.key }, body: JSON.stringify({ email: em, emailConfirm: em2 }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) setErr(t.errors[j.error] || t.errors.server_error); else load();
  }
  const copy = (k: string, v: string) => { navigator.clipboard?.writeText(v).then(() => { setCopied(k); setTimeout(() => setCopied(''), 1500); }); };
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;

  return (
    <main className="page" lang={lang} dir={dirOf(lang)}>
      <h1>{o_.title}</h1>
      {err && <p className="err" role="alert">{err}</p>}
      {o && (<>
        <p>{o_.ref}: <span className="mono">{o.ref}</span></p>
        <p style={{ color: 'var(--muted)' }}>{o_.keep}</p>
        {o.status === 'awaiting_payment' && (
          <div className="buy">
            <p>{o_.sendExactly}</p>
            <p><span className="mono price">{o.amount}</span> {o.asset} <button className="btn sec" onClick={() => copy('a', o.amount)}>{copied === 'a' ? o_.copied : o_.copy}</button></p>
            <p>{o_.toAddr}</p>
            <p><span className="mono">{o.address}</span> <button className="btn sec" onClick={() => copy('d', o.address)}>{copied === 'd' ? o_.copied : o_.copy}</button></p>
            <p>{o_.network}: <b>BEP20 (BNB Smart Chain)</b></p>
            <p>{o_.expiresIn}: <b className="mono">{mmss}</b></p>
            <p className="err">{o_.warnNet}</p>
            <p>{o_.waiting}</p>
          </div>)}
        {o.status === 'paid_unconfirmed' && <p className="ok">{o_.confirming}</p>}
        {(o.status === 'paid' || o.status === 'awaiting_email') && !o.emailSubmitted && (
          <form className="buy" onSubmit={submit}>
            <h2 style={{ marginTop: 0 }}>{o_.emailTitle}</h2>
            <div className="field"><label htmlFor="e1">{o_.email}</label><input id="e1" type="email" required autoComplete="email" dir="ltr" value={em} onChange={e => setEm(e.target.value)} /></div>
            <div className="field"><label htmlFor="e2">{o_.email2}</label><input id="e2" type="email" required dir="ltr" value={em2} onChange={e => setEm2(e.target.value)} /></div>
            <button className="btn" disabled={busy}>{o_.send}</button>
          </form>)}
        {o.emailSubmitted && !o.delivered && ['ready_to_fulfil', 'awaiting_email', 'paid'].includes(o.status) && <p className="ok">{o_.emailSaved}</p>}
        {o.delivered && <p className="ok">{o_.delivered}</p>}
        {o.status === 'expired' && <p className="err">{o_.expired}</p>}
        {o.status === 'underpaid' && <p className="err">{o_.underpaid}</p>}
        {o.status === 'overpaid' && <p className="err">{o_.overpaid}</p>}
        {['refund_requested', 'refunded', 'rejected'].includes(o.status) && <p>{o_.refund}</p>}
        {o.status === 'failed' && <p className="err">{o_.failed}</p>}
        <p style={{ color: 'var(--muted)' }}>{o_.support}</p>
      </>)}
    </main>
  );
}

export default function OrderClient() {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => { { const l = new URLSearchParams(location.search).get('l') as Lang; setLang(LANG_CODES.includes(l) ? l : 'en'); } }, []);
  return <Inner lang={lang} />;
}
