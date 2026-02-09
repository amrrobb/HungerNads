-- HUNGERNADS - Faucet Claims
-- Tracks HNADS token faucet claims per wallet per tier.
-- Rate limited: 1 claim per tier per wallet per 24 hours.
--
-- Tiers:
--   1 = 100 HNADS  (no requirements)
--   2 = 500 HNADS  (3+ bets placed)
--   3 = 1000 HNADS (2+ sponsorships)

CREATE TABLE IF NOT EXISTS faucet_claims (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
  amount REAL NOT NULL,
  claimed_at TEXT NOT NULL
);

CREATE INDEX idx_faucet_claims_wallet ON faucet_claims(wallet_address);
CREATE INDEX idx_faucet_claims_wallet_tier ON faucet_claims(wallet_address, tier);
