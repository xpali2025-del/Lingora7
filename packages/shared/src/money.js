// Exact decimal arithmetic for USDT amounts (18 dp, BigInt). Never use floats for money.
const SCALE = 18n, ONE = 10n ** SCALE;
export function parseAmount(s) {
  const str = String(s).trim();
  if (!/^\d+(\.\d+)?$/.test(str)) throw new Error(`invalid amount: ${s}`);
  const [i, f = ''] = str.split('.');
  if (f.length > 18 && /[1-9]/.test(f.slice(18))) throw new Error('amount has more than 18 decimals');
  return BigInt(i) * ONE + BigInt(f.padEnd(18, '0').slice(0, 18));
}
/** Normalised string: no trailing zeros, at least 2 decimals (13.00, 13.0042). */
export function formatAmount(u) {
  const n = BigInt(u), i = n / ONE, f = (n % ONE).toString().padStart(18, '0').replace(/0+$/, '');
  return `${i}.${f.padEnd(2, '0')}`;
}
export const amountEquals = (a, b) => parseAmount(a) === parseAmount(b);
export const addAmounts = (a, b) => formatAmount(parseAmount(a) + parseAmount(b));
export const cmpAmounts = (a, b) => { const x = parseAmount(a), y = parseAmount(b); return x < y ? -1 : x > y ? 1 : 0; };
/** Convert an integer token amount with `decimals` (e.g. ERC-20 wei, 18) to a decimal string. */
export function fromTokenUnits(raw, decimals = 18) {
  const n = BigInt(raw), d = 10n ** BigInt(decimals);
  return formatAmount((n / d) * ONE + ((n % d) * ONE) / d);
}
/** Price + a 4-dp unique offset (offsetUnits is an integer count of 0.0001). */
export function withOffset(base, offsetUnits) {
  return formatAmount(parseAmount(base) + BigInt(offsetUnits) * (ONE / 10000n));
}
