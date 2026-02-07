/**
 * HUNGERNADS - API Module
 *
 * REST endpoints and WebSocket handlers for the spectator interface.
 * Routes: /battle, /agent, /bet, /sponsor, /leaderboard
 */

export const API_VERSION = 'v1';

export { apiRouter } from './routes';
export { broadcastEvent, broadcastEvents, epochToEvents } from './websocket';
export type {
  BattleEvent,
  EpochStartEvent,
  AgentActionEvent,
  PredictionResultEvent,
  CombatResultEvent,
  AgentDeathEvent,
  EpochEndEvent,
  BattleEndEvent,
  OddsUpdateEvent,
} from './websocket';
