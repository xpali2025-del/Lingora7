// IndexNow ownership file, served at /indexnow-key/ (referenced by keyLocation in scripts/indexnow.js).
export const dynamic = 'force-dynamic';
export async function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new Response('not configured', { status: 404 });
  return new Response(key, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
