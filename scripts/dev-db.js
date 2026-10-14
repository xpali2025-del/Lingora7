// Local development database WITHOUT installing Postgres: an embedded PGlite served over the Postgres wire protocol.
//   npm run dev:db            (then DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres, DB_POOL_MAX=1)
// Not for production: use real PostgreSQL (docker compose up -d db).
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
const dir = process.env.DEV_DB_DIR || './.devdb';
const db = new PGlite(dir);
const server = new PGLiteSocketServer({ db, port: Number(process.env.DEV_DB_PORT || 5433), host: '127.0.0.1' });
await server.start();
console.log(`dev database on postgres://postgres:postgres@127.0.0.1:${process.env.DEV_DB_PORT || 5433}/postgres  (data: ${dir}) — set DB_POOL_MAX=1 DB_IDLE_MS=100 — PGlite serves one connection at a time`);
process.on('SIGINT', async () => { await server.stop(); await db.close(); process.exit(0); });
