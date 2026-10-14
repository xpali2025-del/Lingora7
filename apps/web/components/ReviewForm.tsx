'use client';
import { useEffect, useState, useCallback } from 'react';
import { T, type Lang, LANG_CODES, dirOf } from './i18n';
import Captcha from './Captcha';
export default function ReviewForm({ lang }: { lang: Lang }) {
  const t = T[lang]; const r_ = t.review;
  const [token, setToken] = useState(''); const [name, setName] = useState(''); const [rating, setRating] = useState(0); const [body, setBody] = useState('');
  const [msg, setMsg] = useState(''); const [done, setDone] = useState(false); const [cap, setCap] = useState(''); const onToken = useCallback((x: string) => setCap(x), []);
  useEffect(() => { setToken(new URLSearchParams(location.search).get('t') || ''); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg('');
    const r = await fetch('/api/reviews', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, name, rating, body, language: lang, captcha: cap }) });
    const j = await r.json().catch(() => ({})); if (r.ok) setDone(true); else setMsg(t.errors[j.error] || t.errors.server_error);
  }
  return (
    <main className="page" lang={lang} dir={dirOf(lang)}>
      <h1>{r_.title}</h1>
      {!token && <p className="err">{r_.noToken}</p>}
      {done ? <p className="ok">{r_.thanks}</p> : token && (
        <form onSubmit={submit}>
          <div className="field"><label htmlFor="n">{r_.name}</label><input id="n" required maxLength={40} value={name} onChange={e => setName(e.target.value)} /></div>
          <div className="field"><label>{r_.rating}</label><div className="stars" role="radiogroup">{[1, 2, 3, 4, 5].map(i => <button type="button" key={i} aria-label={`${i}`} aria-pressed={rating === i} onClick={() => setRating(i)}>{i <= rating ? '★' : '☆'}</button>)}</div></div>
          <div className="field"><label htmlFor="b">{r_.body}</label><textarea id="b" required minLength={10} maxLength={1500} rows={5} value={body} onChange={e => setBody(e.target.value)} /></div>
          <Captcha onToken={onToken} />
          <button className="btn">{r_.submit}</button>{msg && <p className="err" role="alert">{msg}</p>}
        </form>)}
    </main>
  );
}
