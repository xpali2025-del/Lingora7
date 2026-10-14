// Staging helper: create a fake deposit for the mock provider.
//   npm run sim:deposit -- --ref LG-ABCD2345        (pays the exact amount of that order)
//   npm run sim:deposit -- --amount 13.0042 [--confirmations 20]
import { getDb } from '@lingora/shared';
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const db = getDb();
let amount = args.amount;
if (args.ref) { const r = await db.query('SELECT unique_amount FROM orders WHERE public_ref=$1', [args.ref]); if (!r.rows[0]) { console.error('order not found'); process.exit(1); } amount = r.rows[0].unique_amount; }
if (!amount) { console.error('usage: --ref LG-XXXX | --amount 13.0042'); process.exit(1); }
const p = (await db.query(`SELECT public_config FROM payment_providers WHERE type='mock'`)).rows[0];
if (!p?.public_config?.receivingAddress) { console.error('mock provider is not configured (set a receiving address in the admin or db seed)'); process.exit(1); }
const tx = '0xsim' + Date.now().toString(16) + Math.random().toString(16).slice(2, 8);
await db.query('INSERT INTO mock_deposits (tx_hash, amount, to_address, confirmations) VALUES ($1,$2,$3,$4)', [tx, amount, p.public_config.receivingAddress, Number(args.confirmations ?? 20)]);
console.log(`simulated deposit ${amount} USDT (${tx})`); await db.close();
