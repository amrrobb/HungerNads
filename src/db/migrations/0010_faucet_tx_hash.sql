-- HUNGERNADS - Faucet TX Hash & Status
-- Adds on-chain transaction tracking to faucet claims.
--   tx_hash: the on-chain transaction hash from token distribution
--   status: 'confirmed' (default) or 'pending' (failed, awaiting retry)

ALTER TABLE faucet_claims ADD COLUMN tx_hash TEXT DEFAULT NULL;
ALTER TABLE faucet_claims ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed';
