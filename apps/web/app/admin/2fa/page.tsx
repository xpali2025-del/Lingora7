import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Admin 2FA', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="page" dir="ltr" lang="en" style={{ maxWidth: 420 }}>
      <h1>Two-factor code</h1>
      {e && <p className="err">Invalid or expired code.</p>}
      <form method="post" action="/admin/2fa/submit/">
        <div className="field"><label htmlFor="c">6-digit code from your authenticator</label><input id="c" name="code" inputMode="numeric" pattern="[0-9 ]{6,7}" autoComplete="one-time-code" required autoFocus /></div>
        <button className="btn">Verify</button>
      </form>
    </main>
  );
}
