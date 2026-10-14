// Creates an admin user with a TOTP secret.  npm run db:seed-admin -- --username nasim --role owner
// The password is read from ADMIN_PASSWORD (never from argv/history). The 2FA secret is printed once.
import { getDb, createAdminUser, loadKey } from '@lingora/shared';
const a = process.argv.slice(2), arg = n => { const i = a.indexOf('--' + n); return i >= 0 ? a[i + 1] : undefined; };
const email = arg('username') || arg('email'), role = arg('role') || 'owner', password = process.env.ADMIN_PASSWORD;
if (!email || !password) { console.error('usage: ADMIN_PASSWORD=... npm run db:seed-admin -- --username nasim [--role owner|support|editor|analyst]'); process.exit(1); }
const db = getDb();
try {
  const u = await createAdminUser(db, { email, password, role, key32: loadKey() });
  console.log(`created ${u.role} ${u.email}\n\nAdd this to your authenticator app NOW (shown once):\n  secret : ${u.totpSecret}\n  url    : ${u.otpauth}`);
} catch (e) { console.error('failed:', e.code || e.message); process.exitCode = 1; } finally { await db.close(); }
