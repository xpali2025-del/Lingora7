import { approvedReviews, getSetting } from '@lingora/shared';
import { db } from './server';

export type PubReview = { name: string; rating: number; body: string; reply?: string | null; country?: string | null; at: string };
export type MarketInfo = { price: number; country: string | null; reviews: PubReview[] };

/**
 * Live data for a market page, read at build time and refreshed by ISR (revalidate) and on-demand revalidation
 * from the admin. Never throws: if the database is unreachable the page falls back to its Markdown values.
 */
export async function marketInfo(code: string): Promise<MarketInfo | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const d = db();
    const m = (await d.query(`SELECT price_usdt::text p, country_code FROM markets WHERE code=$1 AND enabled AND status='live'`, [code])).rows[0];
    if (!m) return null;
    const rows = await approvedReviews(d, { marketCode: code, limit: 20 });
    return { price: Number(m.p), country: m.country_code, reviews: rows.map((r: any) => ({ name: r.display_name, rating: r.rating, body: r.body, reply: r.reply, country: r.country_code, at: new Date(r.created_at).toISOString().slice(0, 10) })) };
  } catch (e) { console.warn('marketInfo fallback:', (e as Error).message); return null; }
}

export type Contact = { email: string; whatsapp: string; facebook: string; instagram: string; x: string; tiktok: string; youtube: string; telegram: string; linkedin: string;
  legal_name: string; hours_ar: string; hours_en: string; address_ar: string; address_en: string };
export const SOCIALS: [keyof Contact, string][] = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['x', 'X'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['telegram', 'Telegram'], ['linkedin', 'LinkedIn']];
const BLANK: Contact = { email: process.env.SUPPORT_EMAIL || 'support@lingora.world', whatsapp: '', facebook: '', instagram: '', x: '', tiktok: '', youtube: '', telegram: '', linkedin: '', legal_name: '', hours_ar: '', hours_en: '', address_ar: '', address_en: '' };
/** Public contact details, edited in the admin. Never throws: falls back to the support e-mail. */
export async function getContact(): Promise<Contact> {
  if (!process.env.DATABASE_URL) return BLANK;
  try { const v = await getSetting(db(), 'contact', null); const m = { ...BLANK, ...(v || {}) }; if (!m.email) m.email = BLANK.email; return m; }
  catch (e) { console.warn('getContact fallback:', (e as Error).message); return BLANK; }
}
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
/** The <li> list used inside the About page. */
export function contactListHtml(c: Contact, lang: 'ar' | 'en'): string {
  const L = lang === 'ar' ? { email: 'البريد الإلكتروني', wa: 'واتساب', hours: 'ساعات العمل', legal: 'الكيان القانوني', addr: 'العنوان', social: 'حساباتنا' } : { email: 'Email', wa: 'WhatsApp', hours: 'Opening hours', legal: 'Legal entity', addr: 'Address', social: 'Find us on' };
  const li = (k: string, v: string) => `<li><span class="k">${k}</span>${v}</li>`;
  const rows = [li(L.email, `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`)];
  if (c.whatsapp) rows.push(li(L.wa, `<a href="https://wa.me/${esc(c.whatsapp)}" rel="noopener nofollow">+${esc(c.whatsapp)}</a>`));
  const hours = lang === 'ar' ? c.hours_ar : c.hours_en, addr = lang === 'ar' ? c.address_ar : c.address_en;
  if (hours) rows.push(li(L.hours, esc(hours)));
  if (c.legal_name) rows.push(li(L.legal, esc(c.legal_name)));
  if (addr) rows.push(li(L.addr, esc(addr)));
  const soc = SOCIALS.filter(([k]) => c[k]).map(([k, n]) => `<a href="${esc(String(c[k]))}" rel="me noopener nofollow">${n}</a>`);
  if (soc.length) rows.push(li(L.social, soc.join(' · ')));
  return `<ul>${rows.join('')}</ul>`;
}
