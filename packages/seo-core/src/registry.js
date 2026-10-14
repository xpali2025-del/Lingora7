// Facts Registry resolver (plan sections 10.2 and 10.3).
// Placeholder forms: {{fact:key}} and {{key}}. Lookup order: exact locale -> language -> global "*".
const PLACEHOLDER = /\{\{\s*(?:fact:)?([a-zA-Z0-9_]+)\s*\}\}/g;
const VERIFY = /\[VERIFY[^\]]*\]/g;

export function findPlaceholders(text) {
  return [...text.matchAll(PLACEHOLDER)].map(m => m[1]);
}

export function lookup(registry, key, locale) {
  const lang = locale.split('-')[0];
  const rank = e => e.market === locale ? 0 : e.market === lang ? 1 : e.market === '*' ? 2 : 9;
  return registry.filter(e => e.key === key && rank(e) < 9).sort((a, b) => rank(a) - rank(b))[0];
}

/** Returns { entry, problem } where problem is null when the fact is usable. */
export function validateEntry(entry, today) {
  if (!entry) return { entry, problem: 'missing' };
  if (!entry.value || !String(entry.value).trim()) return { entry, problem: 'empty value' };
  if (!/^https?:\/\//.test(entry.source_url || '')) return { entry, problem: 'no source_url' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.verified_at || '')) return { entry, problem: 'no verified_at' };
  if (entry.expires_at && entry.expires_at < today) return { entry, problem: `expired ${entry.expires_at}` };
  return { entry, problem: null };
}

export function resolvePage({ text, locale }, registry, today = new Date().toISOString().slice(0, 10)) {
  const problems = [];
  const used = [];
  const out = text.replace(PLACEHOLDER, (whole, key) => {
    const { entry, problem } = validateEntry(lookup(registry, key, locale), today);
    if (problem) { problems.push({ key, problem }); return whole; }
    used.push({ key, source_url: entry.source_url, verified_at: entry.verified_at });
    return entry.value;
  });
  const verifyLeft = (out.match(VERIFY) || []).length;
  return { text: out, problems, used, verifyLeft, ready: problems.length === 0 && verifyLeft === 0 };
}
