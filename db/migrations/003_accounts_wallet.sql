-- Customer accounts, wallet (balance) and top-up requests, plus Supabase hardening.
-- Idempotent: db:migrate re-applies every migration on each run.

-- ---------- customers and sessions ----------
CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,                       -- lower-case; proven by a magic link or a verified Google account
  google_sub TEXT UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, ip TEXT, ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions (customer_id);
-- One-time e-mail sign-in links (only the hash is stored).
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash TEXT PRIMARY KEY, email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
);

-- ---------- wallet ----------
-- Balance is in USDT. The CHECK makes an overdraft impossible even if application code is wrong.
CREATE TABLE IF NOT EXISTS wallets (
  customer_id BIGINT PRIMARY KEY REFERENCES customers(id),
  balance NUMERIC(38,18) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Append-only history; `amount` is signed (+credit, -debit) and `balance_after` is the wallet balance after the change.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  kind TEXT NOT NULL CHECK (kind IN ('topup','purchase','adjustment','refund')),
  amount NUMERIC(38,18) NOT NULL CHECK (amount <> 0),
  balance_after NUMERIC(38,18) NOT NULL CHECK (balance_after >= 0),
  order_id BIGINT REFERENCES orders(id),
  topup_id BIGINT,
  note TEXT, actor TEXT NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON wallet_ledger (customer_id, id DESC);
-- A purchase can only be recorded once per order.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ledger_purchase ON wallet_ledger (order_id) WHERE kind = 'purchase';

-- ---------- top-up requests (customers who cannot pay in USDT, e.g. Yemen: they ask, the owner confirms and credits) ----------
CREATE TABLE IF NOT EXISTS topup_requests (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id),
  email TEXT NOT NULL, name TEXT, contact TEXT NOT NULL,   -- contact = WhatsApp/phone the owner will use
  method TEXT NOT NULL, amount_hint TEXT, note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','rejected')),
  ledger_id BIGINT REFERENCES wallet_ledger(id),
  handled_by TEXT, handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_topups_status ON topup_requests (status, id DESC);

-- ---------- orders paid from the balance ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id BIGINT REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id, id DESC);
ALTER TABLE payment_providers DROP CONSTRAINT IF EXISTS payment_providers_type_check;
ALTER TABLE payment_providers ADD CONSTRAINT payment_providers_type_check CHECK (type IN ('binance_bep20','paypal','payoneer','mock','balance'));

-- ---------- admins who sign in with Google have no password ----------
ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL;

-- ---------- Supabase hardening ----------
-- Supabase exposes the public schema through its REST API with the public "anon" key. Row-level security with no
-- policies makes every table invisible to that API; the app connects with the database owner role, which bypasses RLS.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END $$;
