// Applies db/migrations/*.sql in order (idempotent: every statement uses IF NOT EXISTS) and the seed.
//   npm run db:migrate            -> migrations + seed
//   npm run db:migrate -- --no-seed
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from '@lingora/shared';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = getDb();
for (const f of readdirSync(path.join(root, 'db/migrations')).filter(f => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(path.join(root, 'db/migrations', f), 'utf8')); console.log('applied', f);
}
if (!process.argv.includes('--no-seed')) { await db.exec(readFileSync(path.join(root, 'db/seed.sql'), 'utf8')); console.log('seed ok'); }
await db.close();
