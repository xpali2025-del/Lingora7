// RFC 4226 / 6238 TOTP (HMAC-SHA1, 30 s step) without external dependencies.
import { createHmac, randomBytes } from 'node:crypto';
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function base32Decode(str) {
  let bits = 0, val = 0; const out = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error('invalid base32');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
export const generateSecret = () => base32Encode(randomBytes(20));
export function hotp(secretBuf, counter, digits = 6) {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secretBuf).update(c).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}
export const totp = (secretBuf, now = Date.now(), digits = 6) => hotp(secretBuf, Math.floor(now / 30000), digits);
/** Accepts the current step and +/- `window` steps (clock drift). */
export function verifyTotp(secretBase32, token, now = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(String(token))) return false;
  const key = base32Decode(secretBase32), step = Math.floor(now / 30000);
  let ok = false;
  for (let i = -window; i <= window; i++) if (hotp(key, step + i) === String(token)) ok = true;   // no early exit
  return ok;
}
export const otpauthUrl = (email, secret, issuer = 'Lingora Admin') =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
