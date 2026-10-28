import { encrypt, sha256Hex } from '../crypto.js';
import { CommerceError } from './errors.js';

export async function importCodes(db, { source, notes = '', text, actor, key32 }) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.split(',')[0].trim().replace(/^"|"$/g, '')).filter(Boolean);
  const urls = [], rejected = [];
  for (const l of lines) {
    if (/^(url|link|redeem|code)/i.test(l) && !/^https?:/i.test(l)) continue;   // header row
    try { const u = new URL(l); if (u.protocol !== 'https:') throw 0; urls.push(u.toString()); } catch { rejected.push(l); }
  }
  const unique = [...new Set(urls)];
  return db.tx(async t => {
    const b = (await t.query('INSERT INTO code_batches (source, notes, imported_by) VALUES ($1,$2,$3) RETURNING id', [source || 'csv', notes, actor])).rows[0];
    let added = 0;
    for (const u of unique) {
      const r = await t.query('INSERT INTO codes (batch_id, redeem_url_encrypted, url_hash) VALUES ($1,$2,$3) ON CONFLICT (url_hash) DO NOTHING RETURNING id',
        [b.id, encrypt(u, key32), sha256Hex(u)]);
      if (r.rows[0]) added++;
    }
    await t.query('UPDATE code_batches SET count=$2 WHERE id=$1', [b.id, added]);
    return { batchId: b.id, added, duplicates: unique.length - added, rejected: rejected.length };
  });
}
export async function stockCounts(q) {
  const r = await q.query('SELECT status, count(*)::int AS n FROM codes GROUP BY status');
  const out = { available: 0, reserved: 0, sold: 0, void: 0 };
  for (const x of r.rows) out[x.status] = x.n;
  return out;
}
export async function voidCode(db, { codeId, actor }) {
  const r = await db.query(`UPDATE codes SET status='void' WHERE id=$1 AND status='available' RETURNING id`, [codeId]);
  if (!r.rows[0]) throw new CommerceError('code_not_available');
}
