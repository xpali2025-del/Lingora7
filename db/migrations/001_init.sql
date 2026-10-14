-- Lingora.world schema (architecture plan v2.0, section 4)
-- Amounts are NUMERIC(38,18) so on-chain values compare exactly.

CREATE TABLE IF NOT EXISTS markets (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,              -- URL locale, e.g. ar-eg
  country_code  TEXT,                              -- NULL for global hubs
  locale        TEXT NOT NULL,                     -- BCP-47, e.g. ar-EG
  language      TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK (tier IN ('arab','intl')),
  price_usdt    NUMERIC(38,18) NOT NULL CHECK (price_usdt > 0),
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live')),
  fulfilment_mode TEXT CHECK (fulfilment_mode IN ('manual','auto'))  -- NULL = use global setting
);

CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY, market_id INT NOT NULL REFERENCES markets(id),
  price_usdt NUMERIC(38,18) NOT NULL, changed_at TIMESTAMPTZ NOT NULL DEFAULT now(), changed_by TEXT
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value JSONB NOT NULL);

CREATE TABLE IF NOT EXISTS payment_providers (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL UNIQUE CHECK (type IN ('binance_bep20','paypal','payoneer','mock')),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  public_config JSONB NOT NULL DEFAULT '{}',      -- non-secret: receiving address, network, strategy, expiry...
  config_encrypted TEXT,                           -- secrets (API key/secret), AES-256-GCM, write-only in the UI
  last_test_at TIMESTAMPTZ, last_test_ok BOOLEAN, last_test_message TEXT,
  test_requested_at TIMESTAMPTZ                    -- admin 'Test connection' -> executed by the worker (static IP)
);

CREATE TABLE IF NOT EXISTS market_payment_methods (
  market_id INT NOT NULL REFERENCES markets(id), provider_id INT NOT NULL REFERENCES payment_providers(id),
  enabled BOOLEAN NOT NULL DEFAULT TRUE, sort INT NOT NULL DEFAULT 0,
  PRIMARY KEY (market_id, provider_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  public_ref TEXT NOT NULL UNIQUE,
  key_hash TEXT NOT NULL,
  market_id INT NOT NULL REFERENCES markets(id),
  provider_id INT NOT NULL REFERENCES payment_providers(id),
  price_usdt NUMERIC(38,18) NOT NULL,
  unique_amount NUMERIC(38,18) NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN
    ('created','awaiting_payment','paid_unconfirmed','paid','awaiting_email','ready_to_fulfil','fulfilled',
     'expired','underpaid','overpaid','refund_requested','refunded','rejected','failed')),
  email_encrypted TEXT,
  email_submitted_at TIMESTAMPTZ,
  tx_ref TEXT,
  code_id BIGINT,
  flags JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ
);
-- Two open orders can never share an amount: the unique decimal is the matching key.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_amount ON orders (unique_amount) WHERE status = 'awaiting_payment';
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status, created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL REFERENCES orders(id),
  type TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}', at TIMESTAMPTZ NOT NULL DEFAULT now(), actor TEXT NOT NULL DEFAULT 'system'
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events (order_id, id);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT REFERENCES orders(id),
  provider_id INT NOT NULL REFERENCES payment_providers(id),
  tx_hash TEXT NOT NULL UNIQUE,                    -- idempotency: one payment can never fulfil two orders
  amount NUMERIC(38,18) NOT NULL,
  asset TEXT NOT NULL, network TEXT NOT NULL,
  confirmations INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('matched','unmatched','underpaid','overpaid','ignored','refunded')),
  detected_at TIMESTAMPTZ NOT NULL,
  raw JSONB NOT NULL DEFAULT '{}',
  resolved_by TEXT, resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS code_batches (
  id SERIAL PRIMARY KEY, source TEXT NOT NULL, imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  count INT NOT NULL DEFAULT 0, notes TEXT, imported_by TEXT
);
CREATE TABLE IF NOT EXISTS codes (
  id BIGSERIAL PRIMARY KEY, batch_id INT REFERENCES code_batches(id),
  redeem_url_encrypted TEXT NOT NULL,
  url_hash TEXT NOT NULL UNIQUE,                   -- de-duplicates re-imports
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','sold','void')),
  sold_order_id BIGINT REFERENCES orders(id), reserved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_codes_status ON codes (status, id);

CREATE TABLE IF NOT EXISTS email_outbox (
  id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL REFERENCES orders(id),
  template TEXT NOT NULL CHECK (template IN ('order_received','code_delivered','review_invitation','refund_decision','admin_alert')),
  locale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ, provider_msg_id TEXT, last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outbox_due ON email_outbox (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS review_tokens (
  token_hash TEXT PRIMARY KEY, order_id BIGINT NOT NULL UNIQUE REFERENCES orders(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), used_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT UNIQUE REFERENCES orders(id),    -- NULL only for labelled imported reviews
  market_id INT NOT NULL REFERENCES markets(id),
  display_name TEXT NOT NULL, rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL, language TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE, imported BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  featured BOOLEAN NOT NULL DEFAULT FALSE, reply TEXT, edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), moderated_by TEXT
);

CREATE TABLE IF NOT EXISTS facts_registry (
  id SERIAL PRIMARY KEY, market TEXT NOT NULL, topic TEXT NOT NULL, fact TEXT NOT NULL,
  source_url TEXT NOT NULL, verified_at DATE NOT NULL, expires_at DATE
);

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','support','editor','analyst')),
  totp_secret_encrypted TEXT, totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  failed_logins INT NOT NULL DEFAULT 0, locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_login_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'full' CHECK (stage IN ('password_ok','full')),   -- password_ok = awaiting TOTP
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, ip TEXT, ua TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, user_id INT, actor TEXT, action TEXT NOT NULL, target TEXT,
  ip TEXT, data JSONB NOT NULL DEFAULT '{}', at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY, count INT NOT NULL DEFAULT 0, window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);
