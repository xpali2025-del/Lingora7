import { NextResponse } from 'next/server';
import { getWallet, listLedger, sellableStock } from '@lingora/shared';
import { db, fail, limit, currentCustomer, googleEnabled } from '@/lib/server';
export const dynamic = 'force-dynamic';

/** Who is signed in, their balance, recent wallet lines and orders. Never returns codes or e-mails of orders. */
export async function GET(req: Request) {
  try {
    await limit(req, 'me', 120, 600);
    const inStock = (await sellableStock(db())) > 0;
    const c = await currentCustomer();
    if (!c) return NextResponse.json({ customer: null, google: googleEnabled(), inStock });
    const [wallet, ledger, orders] = await Promise.all([getWallet(db(), c.id), listLedger(db(), c.id, 20),
      db().query(`SELECT o.public_ref AS ref, o.status, o.created_at, m.code AS market FROM orders o JOIN markets m ON m.id=o.market_id WHERE o.customer_id=$1 ORDER BY o.id DESC LIMIT 20`, [c.id])]);
    return NextResponse.json({ customer: { email: c.email, name: c.name }, balance: wallet.balance, ledger, orders: orders.rows, google: googleEnabled(), inStock });
  } catch (e) { return fail(e); }
}
