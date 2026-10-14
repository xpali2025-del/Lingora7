import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(_scrypt);

/** MASTER_ENCRYPTION_KEY = 32 random bytes, base64. */
export function loadKey(b64 = process.env.MASTER_ENCRYPTION_KEY) {
  if (!b64) throw new Error('MASTER_ENCRYPTION_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('MASTER_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}
/** AES-256-GCM. Output: v1:<base64(iv|tag|ciphertext)>. */
export function encrypt(plain, key = loadKey()) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function decrypt(token, key = loadKey()) {
  if (typeof token !== 'string' || !token.startsWith('v1:')) throw new Error('bad ciphertext format');
  const raw = Buffer.from(token.slice(3), 'base64');
  if (raw.length < 29) throw new Error('ciphertext too short');
  const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');   // throws on tamper
}
export const sha256Hex = s => createHash('sha256').update(String(s)).digest('hex');
export const hmacSha256Hex = (secret, msg) => createHmac('sha256', secret).update(msg).digest('hex');
export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Password hashing: scrypt$N$salt$hash. */
export async function hashPassword(pw, N = 16384) {
  const salt = randomBytes(16);
  const h = await scrypt(pw, salt, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${salt.toString('base64')}$${h.toString('base64')}`;
}
export async function verifyPassword(pw, stored) {
  const [alg, N, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const h = await scrypt(pw, Buffer.from(salt, 'base64'), 32, { N: Number(N), r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return safeEqual(h.toString('base64'), hash);
}
