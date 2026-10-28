// Customer wallet (balance in USDT) and top-up requests. Money only moves through these functions.
import { parseAmount, formatAmount } from './money.js';
import { CommerceError } from './commerce/errors.js';
import { ensureCustomer, normEmail } from './customers.js';

export const ensureWallet = (t, customerId) => t.query('INSERT INTO wallets (customer_id) VALUES ($1) ON CONFLICT DO NOTHING', [customerId]);
const amountOrThrow = a => { try { const u = parseAmount(a); if (u <= 0n) throw 0; return formatAmount(u); } catch { throw new CommerceError('invalid_amount'); } };

export async function getWallet(q, customerId) {
  const r = (await q.query('SELECT balance FROM wallets WHERE customer_id=$1', [customerId])).rows[0];
  return { balance: formatAmount(parseAmount(r ? r.balance : '0')) };
}
export async function listLedger(q, customerId, limit = 30) {
  return (await q.query('SELECT id, kind, amount::text, balance_after::text, note, created_at, order_id FROM wallet_ledger WHERE customer_id=$1 ORDER BY id DESC LIMIT $2', [customerId, limit])).rows
    .map(r => ({ ...r, amount: formatAmount(parseAmount(String(r.amount).replace('-', ''))) , sign: String(r.amount).startsWith('-') ? '-' : '+', balance_after: formatAmount(parseAmount(r.balance_after)) }));
}

/** Adds money to a wallet (owner/support confirmed a payment received outside the site). Creates the customer if needed. */
export async function creditWallet(db, { email, amount, note = '', actor, topupId = null, kind = 'topup' }) {
  const amt = amountOrThrow(amount);
  return db.tx(async t => {
    const c = await ensureCustomer(t, email);
    await ensureWallet(t, c.id);
    const w = (await t.query('UPDATE wallets SET balance = balance + $2::numeric, updated_at = now() WHERE customer_id=$1 RETURNING balance', [c.id, amt])).rows[0];
    const l = (await t.query(`INSERT INTO wallet_ledger (customer_id, kind, amount, balance_after, topup_id, note, actor) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [c.id, kind, amt, w.balance, topupId, String(note).slice(0, 200), actor])).rows[0];
    return { customerId: c.id, ledgerId: l.id, balance: formatAmount(parseAmount(w.balance)) };
  });
}
/** Owner correction that removes money (never below zero). */
export async function debitWallet(db, { email, amount, note = '', actor }) {
  const amt = amountOrThrow(amount);
  return db.tx(async t => {
    const c = (await t.query('SELECT id FROM customers WHERE email=$1', [normEmail(email)])).rows[0];
    if (!c) throw new CommerceError('not_found');
    const w = (await t.query('UPDATE wallets SET balance = balance - $2::numeric, updated_at = now() WHERE customer_id=$1 AND balance >= $2::numeric RETURNING balance', [c.id, amt])).rows[0];
    if (!w) throw new CommerceError('insufficient_balance');
    await t.query(`INSERT INTO wallet_ledger (customer_id, kind, amount, balance_after, note, actor) VALUES ($1,'adjustment',$2::numeric * -1,$3,$4,$5)`, [c.id, amt, w.balance, String(note).slice(0, 200), actor]);
    return { balance: formatAmount(parseAmount(w.balance)) };
  });
}

// ---------- top-up requests ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export async function createTopupRequest(db, { email, name = '', contact, method, amountHint = '', note = '' }) {
  const e = normEmail(email);
  if (!EMAIL_RE.test(e) || e.length > 254) throw new CommerceError('invalid_email');
  const c = String(contact || '').trim().slice(0, 40), mth = String(method || '').trim().slice(0, 60);
  if (c.length < 5 || !mth) throw new CommerceError('invalid_request');
  const open = (await db.query(`SELECT count(*)::int n FROM topup_requests WHERE email=$1 AND status='pending'`, [e])).rows[0].n;
  if (open >= 3) throw new CommerceError('too_many_open_requests');
  const r = await db.query(`INSERT INTO topup_requests (email, name, contact, method, amount_hint, note) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [e, String(name).trim().slice(0, 80), c, mth, String(amountHint).trim().slice(0, 60), String(note).trim().slice(0, 500)]);
  return { id: r.rows[0].id };
}
export async function listTopups(q, { status = null, limit = 100 } = {}) {
  return (await q.query(`SELECT * FROM topup_requests WHERE ($1::text IS NULL OR status=$1) ORDER BY (status='pending') DESC, id DESC LIMIT $2`, [status, limit])).rows;
}
/** credit: confirmed the payment arrived -> money lands in the wallet. reject: nothing received / refused. */
export async function resolveTopup(db, { id, action, amount, actor, note = '' }) {
  if (!['credit', 'reject'].includes(action)) throw new CommerceError('bad_action');
  const amt = action === 'credit' ? amountOrThrow(amount) : null;
  return db.tx(async t => {
    const r = (await t.query('SELECT * FROM topup_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!r) throw new CommerceError('not_found');
    if (r.status !== 'pending') throw new CommerceError('already_resolved');
    if (action === 'reject') {
      await t.query(`UPDATE topup_requests SET status='rejected', handled_by=$2, handled_at=now(), note=COALESCE(NULLIF($3,''), note) WHERE id=$1`, [id, actor, note]);
      return { status: 'rejected' };
    }
    const c = await ensureCustomer(t, r.email);
    await ensureWallet(t, c.id);
    const w = (await t.query('UPDATE wallets SET balance = balance + $2::numeric, updated_at = now() WHERE customer_id=$1 RETURNING balance', [c.id, amt])).rows[0];
    const l = (await t.query(`INSERT INTO wallet_ledger (customer_id, kind, amount, balance_after, topup_id, note, actor) VALUES ($1,'topup',$2,$3,$4,$5,$6) RETURNING id`,
      [c.id, amt, w.balance, id, `top-up #${id} (${r.method})`, actor])).rows[0];
    await t.query(`UPDATE topup_requests SET status='credited', customer_id=$2, ledger_id=$3, handled_by=$4, handled_at=now() WHERE id=$1`, [id, c.id, l.id, actor]);
    return { status: 'credited', balance: formatAmount(parseAmount(w.balance)), customerId: c.id };
  });
}
