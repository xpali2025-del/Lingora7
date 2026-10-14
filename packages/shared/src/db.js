// Tiny DB adapter so production (pg) and tests (PGlite) share one interface:
//   db.query(sql, params) -> { rows }      db.tx(async t => { await t.query(...) })      db.exec(sql)
import pg from 'pg';
export function createPgDb(connectionString = process.env.DATABASE_URL, opts = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new pg.Pool({ connectionString, max: opts.max ?? Number(process.env.DB_POOL_MAX || 10), idleTimeoutMillis: Number(process.env.DB_IDLE_MS || 30000), connectionTimeoutMillis: Number(process.env.DB_CONNECT_MS || 5000) });
  // Return NUMERIC as strings (pg default) and BIGINT as strings; we never parse money to float.
  return {
    query: (text, params) => pool.query(text, params),
    exec: text => pool.query(text),
    async tx(fn) {
      const c = await pool.connect();
      try { await c.query('BEGIN'); const r = await fn({ query: (t, p) => c.query(t, p) }); await c.query('COMMIT'); return r; }
      catch (e) { try { await c.query('ROLLBACK'); } catch {} throw e; }
      finally { c.release(); }
    },
    close: () => pool.end(),
  };
}
export function createPgliteDb(pglite) {
  return {
    query: (text, params) => pglite.query(text, params),
    exec: text => pglite.exec(text),
    tx: fn => pglite.transaction(t => fn({ query: (x, p) => t.query(x, p) })),
    close: () => pglite.close(),
  };
}
let _shared;
export const getDb = () => (_shared ??= createPgDb());
