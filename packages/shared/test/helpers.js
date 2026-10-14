import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPgliteDb } from '../src/db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const KEY = Buffer.alloc(32, 9);
export const ADDR = '0x1111111111111111111111111111111111111111';

/** Fresh in-memory Postgres (PGlite) with the real migrations + seed and a configured mock provider. */
export async function makeDb({ configureProvider = true } = {}) {
  const pg = new PGlite();
  const db = createPgliteDb(pg);
  for (const f of readdirSync(path.join(ROOT, 'db/migrations')).sort()) await db.exec(readFileSync(path.join(ROOT, 'db/migrations', f), 'utf8'));
  await db.exec(readFileSync(path.join(ROOT, 'db/seed.sql'), 'utf8'));
  if (configureProvider) {
    await db.query(`UPDATE payment_providers SET enabled=TRUE, public_config=$1 WHERE type='mock'`,
      [JSON.stringify({ receivingAddress: ADDR, network: 'BSC', asset: 'USDT' })]);
  }
  return db;
}
export const providerId = async (db, type = 'mock') => (await db.query('SELECT id FROM payment_providers WHERE type=$1', [type])).rows[0].id;
let n = 0;
export const deposit = (amount, extra = {}) => ({ txRef: '0xtx' + (++n).toString(16).padStart(8, '0'), amount, asset: 'USDT', network: 'BSC', confirmations: 20, detectedAt: new Date().toISOString(), ...extra });
export const SAMPLE_URLS = i => `https://www.duolingo.com/redeem/TEST-${i}`;
