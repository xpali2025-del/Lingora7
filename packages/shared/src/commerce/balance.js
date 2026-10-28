// Paying an order from the customer wallet. Debit, order, ledger line and (in auto mode) code allocation happen in ONE transaction.
import { randomInt } from 'node:crypto';
import { encrypt, sha256Hex, randomToken } from '../crypto.js';
import { parseAmount, formatAmount } from '../money.js';
import { CommerceError } from './errors.js';
import { addEvent, transition } from './state.js';
import { readyForFulfilment } from './fulfilment.js';
import { assertInStock } from './stock.js';

const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const newRef = () => 'LG-' + Array.from({ length: 8 }, () => REF_ALPHABET[randomInt(REF_ALPHABET.length)]).join('');

export async function createOrderFromBalance(db, { customerId, marketCode, key32, ipHash = null }) {
  const m = (await db.query(`SELECT * FROM markets WHERE code=$1 AND enabled AND status='live'`, [marketCode])).rows[0];
  if (!m) throw new CommerceError('market_unavailable');
  await assertInStock(db);
  const price = formatAmount(parseAmount(m.price_usdt));
  const key = randomToken(24);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.tx(async t => {
        const c = (await t.query('SELECT id, email FROM customers WHERE id=$1', [customerId])).rows[0];
        if (!c) throw new CommerceError('not_found');
        const provider = (await t.query(`SELECT id FROM payment_providers WHERE type='balance' AND enabled`)).rows[0];
        if (!provider) throw new CommerceError('no_payment_method');
        // The WHERE clause is the lock: two concurrent purchases cannot both spend the same money.
        const w = (await t.query(`UPDATE wallets SET balance = balance - $2::numeric, updated_at = now() WHERE customer_id=$1 AND balance >= $2::numeric RETURNING balance`, [c.id, price])).rows[0];
        if (!w) throw new CommerceError('insufficient_balance');
        const o = (await t.query(
          `INSERT INTO orders (public_ref,key_hash,market_id,provider_id,price_usdt,unique_amount,status,expires_at,paid_at,customer_id,flags,email_encrypted,email_submitted_at)
           VALUES ($1,$2,$3,$4,$5,$5,'paid', now(), now(), $6, $7, $8, now()) RETURNING *`,
          [newRef(), sha256Hex(key), m.id, provider.id, price, c.id, JSON.stringify(ipHash ? { ipHash } : {}), encrypt(c.email, key32)])).rows[0];
        await t.query(`INSERT INTO wallet_ledger (customer_id, kind, amount, balance_after, order_id, note, actor) VALUES ($1,'purchase',$2::numeric * -1,$3,$4,$5,'customer')`,
          [c.id, price, w.balance, o.id, `order ${o.public_ref}`]);
        await addEvent(t, o.id, 'created', { market: m.code, amount: price, provider: 'balance' }, 'customer');
        await addEvent(t, o.id, 'paid_from_balance', { balanceAfter: formatAmount(parseAmount(w.balance)) }, 'customer');
        await transition(t, o.id, 'paid', 'awaiting_email', {}, 'customer');
        const r = await readyForFulfilment(t, { ...o, status: 'awaiting_email', market_mode: m.fulfilment_mode });
        return { ref: o.public_ref, key, status: r.status, mode: r.mode, priceUsdt: price, balance: formatAmount(parseAmount(w.balance)), market: m.code };
      });
    } catch (e) { if (!(e && (e.code === '23505' || /duplicate key/i.test(e.message || '')))) throw e; }   // public_ref collision: retry
  }
  throw new CommerceError('busy');
}
