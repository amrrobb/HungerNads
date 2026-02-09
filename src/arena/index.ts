/**
 * HUNGERNADS - Arena Module
 *
 * Battle management, epoch processing, combat resolution, death mechanics.
 */

// Arena Manager (battle lifecycle)
export { ArenaManager, DEFAULT_BATTLE_CONFIG } from './arena';
export type {
  BattleStatus,
  BattleState,
  BattleConfig,
  BattleRecord,
  EliminationRecord,
} from './arena';

// Epoch processing
export { processEpoch } from './epoch';
export type { EpochResult } from './epoch';

// Combat resolution
export { resolveCombat, applyBleed } from './combat';
export type { CombatResult, CombatOutcome, BleedResult, DefendCostResult, CombatAgentState } from './combat';

// Death mechanics
export { checkDeaths, determineCause } from './death';
export type { DeathEvent, DeathCause, PredictionResult as DeathPredictionResult, GenerateFinalWords } from './death';

// Prediction resolution
export { resolvePredictions } from './prediction';
export type { PredictionResult, PredictionInput } from './prediction';

// Hex grid positioning
export {
  ARENA_HEXES,
  HEX_DIRECTIONS,
  hexKey,
  parseHexKey,
  hexEquals,
  hexDistance,
  isAdjacent,
  isValidHex,
  getHexLabel,
  getNeighbors,
  getNeighborInDirection,
  assignInitialPositions,
  getOccupant,
  isHexOccupied,
  getAdjacentAgents,
  validateMove,
  executeMove,
  buildSpatialContext,
} from './grid';
export type { HexCoord, ArenaHex, MoveResult } from './grid';

// Price feed
export { PriceFeed, ASSETS } from './price-feed';
export type { Asset, MarketData as PriceFeedMarketData } from './price-feed';
