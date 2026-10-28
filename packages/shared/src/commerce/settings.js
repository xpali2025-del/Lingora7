export async function getSetting(q, key, fallback = null) {
  const r = await q.query('SELECT value FROM settings WHERE key=$1', [key]);
  return r.rows[0] ? r.rows[0].value : fallback;
}
export async function setSetting(q, key, value) {
  await q.query('INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value', [key, JSON.stringify(value)]);
}
