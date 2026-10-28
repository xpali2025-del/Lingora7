import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Admin login', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="page" dir="ltr" lang="en" style={{ maxWidth: 420 }}>
      <h1>Admin</h1>
      {e && <p className="err">{e === 'locked' ? 'Account temporarily locked. Try again later.' : e === 'denied' ? 'This Google account is not allowed to sign in to the admin.' : 'Invalid credentials.'}</p>}
      {process.env.GOOGLE_CLIENT_ID && <p><a className="btn" href="/api/auth/google/start?type=admin">Continue with Google</a></p>}
      <form method="post" action="/admin/login/submit/">
        <div className="field"><label htmlFor="em">Username</label><input id="em" name="email" type="text" required autoComplete="username" /></div>
        <div className="field"><label htmlFor="pw">Password</label><input id="pw" name="password" type="password" required autoComplete="current-password" /></div>
        <button className="btn">Continue</button>
      </form>
    </main>
  );
}
