/**
 * HUNGERNADS - Chain Module
 *
 * On-chain integration with HungernadsArena and HungernadsBetting
 * contracts on Monad testnet via viem, plus nad.fun token operations.
 */

export {
  HungernadsChainClient,
  createChainClient,
  battleIdToBytes32,
  monadTestnet,
  type ChainConfig,
  type AgentResult,
  type OnChainBattle,
  type OnChainAgentStats,
} from './client';

export { hungernadsArenaAbi, hungernadsBettingAbi } from './abis';

export {
  NadFunClient,
  createNadFunClient,
  type NadFunConfig,
} from './nadfun';
