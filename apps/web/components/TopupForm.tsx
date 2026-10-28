'use client';
import { useState, useCallback } from 'react';
import { type Lang } from './i18n';
import { A, aErr } from './i18n-account';
import Captcha from './Captcha';

/** Customers who cannot pay in USDT ask for a balance top-up; the owner confirms the payment by hand. */
export default function TopupForm({ lang }: { lang: Lang }) {
  const t = A(lang);
  const [f, setF] = useState({ name: '', email: '', contact: '', method: '', amountHint: '', note: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false); const [cap, setCap] = useState('');
  const onToken = useCallback((x: string) => setCap(x), []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const r = await fetch('/api/topups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, captcha: cap }) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok) setDone(true); else setErr(aErr(lang, j.error));
  }
  return (
    <section id="topup" className="buy">
      <h2 style={{ marginTop: 0 }}>{t.tuTitle}</h2>
      <p>{t.tuIntro}</p>
      {done ? <p className="ok">{t.tuDone}</p> : (
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="tn">{t.tuName}</label><input id="tn" value={f.name} onChange={set('name')} maxLength={80} /></div>
          <div className="field"><label htmlFor="te">{t.tuEmail}</label><input id="te" type="email" required dir="ltr" value={f.email} onChange={set('email')} autoComplete="email" /></div>
          <div className="field"><label htmlFor="tc">{t.tuContact}</label><input id="tc" required dir="ltr" value={f.contact} onChange={set('contact')} maxLength={40} inputMode="tel" /></div>
          <div className="field"><label htmlFor="tm">{t.tuMethod}</label><input id="tm" required value={f.method} onChange={set('method')} maxLength={60} /></div>
          <div className="field"><label htmlFor="ta">{t.tuAmount}</label><input id="ta" value={f.amountHint} onChange={set('amountHint')} maxLength={60} /></div>
          <div className="field"><label htmlFor="tt">{t.tuNote}</label><textarea id="tt" rows={3} value={f.note} onChange={set('note')} maxLength={500} /></div>
          <Captcha onToken={onToken} />
          <button className="btn" disabled={busy}>{t.tuSend}</button>
          {err && <p className="err" role="alert">{err}</p>}
        </form>)}
    </section>
  );
}
