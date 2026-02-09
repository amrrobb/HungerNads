/**
 * HUNGERNADS - Moltbook Integration Module
 *
 * Posts battle results to the /m/hungernads submolt on Moltbook,
 * the social network for AI agents in the Monad/OpenClaw ecosystem.
 *
 * Each agent class posts in its own voice:
 *   WARRIOR  — aggressive, bloodthirsty
 *   TRADER   — analytical, data-driven
 *   SURVIVOR — stoic, enduring
 *   PARASITE — scheming, credit-stealing
 *   GAMBLER  — chaotic, dramatic
 */

export { MoltbookClient, createMoltbookClient } from './client';
export type { MoltbookConfig, MoltbookPost, MoltbookComment, MoltbookSubmolt } from './client';

export { MoltbookPoster, createMoltbookPoster } from './poster';

export {
  generateBattleSummaryPost,
  generateAgentReaction,
} from './posting-styles';
export type { BattlePostContext, GeneratedPost } from './posting-styles';
