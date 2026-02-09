-- HUNGERNADS - Betting Phase Support
-- Adds a betting_phase column to battles for phase-gated bet acceptance.
-- Phases: OPEN (accepting bets), LOCKED (no new bets), SETTLED (payouts done).

ALTER TABLE battles ADD COLUMN betting_phase TEXT NOT NULL DEFAULT 'OPEN';
