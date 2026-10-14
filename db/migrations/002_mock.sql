-- Development / staging only: deposits created by `npm run sim:deposit`, read by the 'mock' provider.
CREATE TABLE IF NOT EXISTS mock_deposits (
  id BIGSERIAL PRIMARY KEY, tx_hash TEXT NOT NULL UNIQUE, amount NUMERIC(38,18) NOT NULL,
  to_address TEXT NOT NULL, confirmations INT NOT NULL DEFAULT 20, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
