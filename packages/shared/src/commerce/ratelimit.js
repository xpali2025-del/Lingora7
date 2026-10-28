// DB-backed, works across serverless instances.
export async function rateLimit(db, key, limit, windowSec) {
  const r = await db.query(
    `INSERT INTO rate_limits (key,count,window_start) VALUES ($1,1,now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - ($2::int * interval '1 second') THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - ($2::int * interval '1 second') THEN now() ELSE rate_limits.window_start END
     RETURNING count`, [key, windowSec]);
  return Number(r.rows[0].count) <= limit;
}
