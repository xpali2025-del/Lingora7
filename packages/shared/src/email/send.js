// Email delivery adapters. EMAIL_PROVIDER = resend | postmark | log. (SES needs SigV4; use its SMTP/HTTP relay or add an adapter.)
export function createEmailSender({ provider = process.env.EMAIL_PROVIDER || 'log', apiKey = process.env.EMAIL_API_KEY, from = process.env.EMAIL_FROM || 'support@lingora.world', fetchImpl = fetch, log = console.log } = {}) {
  if (provider === 'log') {
    const sent = [];
    return { provider, sent, async send(m) { const id = `log-${sent.length + 1}`; sent.push({ ...m, id }); log(`[email:log] to=${m.to} subject="${m.subject}"`); return { id }; } };
  }
  if (!apiKey) throw new Error('EMAIL_API_KEY is not set');
  if (provider === 'resend') return { provider, async send({ to, subject, html, text }) {
    const r = await fetchImpl('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }) });
    const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`resend ${r.status}: ${b.message || 'send failed'}`); return { id: b.id };
  } };
  if (provider === 'postmark') return { provider, async send({ to, subject, html, text }) {
    const r = await fetchImpl('https://api.postmarkapp.com/email', { method: 'POST', headers: { 'X-Postmark-Server-Token': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ From: from, To: to, Subject: subject, HtmlBody: html, TextBody: text, MessageStream: 'outbound', TrackOpens: false, TrackLinks: 'None' }) });
    const b = await r.json().catch(() => ({})); if (!r.ok || b.ErrorCode) throw new Error(`postmark ${r.status}: ${b.Message || 'send failed'}`); return { id: b.MessageID };
  } };
  throw new Error(`unsupported EMAIL_PROVIDER: ${provider}`);
}
