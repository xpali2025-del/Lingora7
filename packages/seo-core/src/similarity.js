// 5-word shingle containment with Arabic normalisation (plan section 10.2 / 10.6).
export function normalise(text) {
  return text
    .replace(/[ً-ٰٟـ]/g, '')   // diacritics + tatweel
    .replace(/[آأإ]/g, 'ا')     // alef variants -> alef
    .replace(/ى/g, 'ي')                  // alef maqsura -> ya
    .replace(/ة/g, 'ه')                  // ta marbuta -> ha
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}
export function shingles(text, n = 5) {
  const w = normalise(text).split(' ').filter(Boolean);
  const set = new Set();
  for (let i = 0; i + n <= w.length; i++) set.add(w.slice(i, i + n).join(' '));
  return set;
}
/** Share of A's shingles also found in B (containment). */
export function containment(a, b, n = 5) {
  const A = shingles(a, n), B = shingles(b, n);
  if (!A.size) return 0;
  let hit = 0; for (const s of A) if (B.has(s)) hit++;
  return hit / A.size;
}
export const MAX_SAME_LANG_MARKET = 0.20;
export function checkPair(a, b, limit = MAX_SAME_LANG_MARKET) {
  const ab = containment(a, b), ba = containment(b, a);
  const worst = Math.max(ab, ba);
  return { ab, ba, worst, pass: worst <= limit };
}
