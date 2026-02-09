-- HUNGERNADS Sponsorship Tiers
-- Adds tier and epoch tracking to sponsorships table.
-- Tier is a TEXT field matching SponsorTier enum values.
-- epoch_number tracks which epoch the sponsorship was applied in (for 1-per-agent-per-epoch cap).

ALTER TABLE sponsorships ADD COLUMN tier TEXT DEFAULT NULL;
ALTER TABLE sponsorships ADD COLUMN epoch_number INTEGER DEFAULT NULL;

-- Index for efficient per-epoch lookups (cap enforcement and effect resolution)
CREATE INDEX IF NOT EXISTS idx_sponsorships_battle_epoch ON sponsorships(battle_id, epoch_number);
