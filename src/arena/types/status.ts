/**
 * HUNGERNADS - Battle Status Type
 *
 * Single source of truth for the battle lifecycle status.
 * Shared between ArenaManager (engine) and ArenaDO (durable object).
 *
 * Lifecycle: PENDING -> LOBBY -> COUNTDOWN -> BETTING_OPEN -> ACTIVE -> COMPLETED -> SETTLED
 *            At any point before ACTIVE: -> CANCELLED
 */

export type BattleStatus =
  | 'PENDING'
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'BETTING_OPEN'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'SETTLED';

/**
 * Battle phase within the ACTIVE status.
 *
 * The battle progresses through 4 phases with increasing danger:
 *   LOOT        -> No combat. Agents race for cornucopia items.
 *   HUNT        -> Combat enabled. Outer ring becomes dangerous (storm).
 *   BLOOD       -> Storm tightens. Forced fights in shrinking safe zone.
 *   FINAL_STAND -> Only center tiles safe. Kill or die.
 */
export type BattlePhase = 'LOOT' | 'HUNT' | 'BLOOD' | 'FINAL_STAND';
