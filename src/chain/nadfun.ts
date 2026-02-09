/**
 * HUNGERNADS - NadFun Client
 *
 * Wrapper around @nadfun/sdk for token operations on nad.fun.
 * Used for $HNADS token creation, buying, selling, and curve state queries.
 *
 * Follows the same graceful-fallback pattern as client.ts -- returns null
 * if required env vars (MONAD_RPC_URL, PRIVATE_KEY) are missing.
 */

import {
  initSDK,
  type NadFunSDK,
  type CurveState,
  type CurveStream,
  type CurveEvent,
  type CurveEventType,
  type QuoteResult,
  type CreateTokenResult,
  parseEther,
  formatEther,
} from '@nadfun/sdk';
import type { Address, Hex } from 'viem';

// ─── Types ──────────────────────────────────────────────────────────

export interface NadFunConfig {
  rpcUrl: string;
  privateKey: `0x${string}`;
  network?: 'testnet' | 'mainnet';
  /** Monad WSS endpoint for real-time curve event streaming. */
  wsUrl?: string;
}

// ─── NadFun Client Wrapper ──────────────────────────────────────────

export class NadFunClient {
  private sdk: NadFunSDK;
  readonly network: 'testnet' | 'mainnet';

  constructor(config: NadFunConfig) {
    this.network = config.network ?? 'testnet';
    this.sdk = initSDK({
      rpcUrl: config.rpcUrl,
      privateKey: config.privateKey,
      network: this.network,
      wsUrl: config.wsUrl,
    });
  }

  /** The wallet address used by this client. */
  get walletAddress(): Address {
    return this.sdk.account.address;
  }

  // ─── Token Creation ─────────────────────────────────────────────

  /**
   * Create $HNADS token on nad.fun.
   * Full flow: image upload -> metadata upload -> salt mining -> deploy.
   */
  async createHNADS(params: {
    name: string;
    symbol: string;
    description: string;
    image: Blob | File;
    imageContentType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
    website?: string;
    twitter?: string;
    telegram?: string;
    initialBuyAmount?: bigint;
  }): Promise<CreateTokenResult> {
    console.log(`[nadfun] Creating token ${params.symbol} on ${this.network}...`);

    const result = await this.sdk.createToken({
      name: params.name,
      symbol: params.symbol,
      description: params.description,
      image: params.image,
      imageContentType: params.imageContentType,
      website: params.website,
      twitter: params.twitter,
      telegram: params.telegram,
      initialBuyAmount: params.initialBuyAmount,
    });

    console.log(`[nadfun] Token created: ${result.tokenAddress} (tx: ${result.transactionHash})`);
    return result;
  }

  // ─── Trading ────────────────────────────────────────────────────

  /**
   * Buy tokens with MON. Uses simpleBuy with automatic slippage handling.
   *
   * @param tokenAddress - Token contract address
   * @param amountInMon  - Amount of MON to spend (as bigint in wei)
   * @param slippagePercent - Slippage tolerance (default 1%)
   * @returns Transaction hash
   */
  async buyToken(
    tokenAddress: Address,
    amountInMon: bigint,
    slippagePercent = 1,
  ): Promise<Hex> {
    console.log(
      `[nadfun] Buying token ${tokenAddress} for ${formatEther(amountInMon)} MON (slippage ${slippagePercent}%)`,
    );

    const tx = await this.sdk.simpleBuy({
      token: tokenAddress,
      amountIn: amountInMon,
      slippagePercent,
    });

    console.log(`[nadfun] Buy tx: ${tx}`);
    return tx;
  }

  /**
   * Sell tokens for MON. Uses simpleSell with automatic slippage handling.
   *
   * @param tokenAddress - Token contract address
   * @param amountIn     - Amount of tokens to sell (as bigint in token decimals)
   * @param slippagePercent - Slippage tolerance (default 1%)
   * @returns Transaction hash
   */
  async sellToken(
    tokenAddress: Address,
    amountIn: bigint,
    slippagePercent = 1,
  ): Promise<Hex> {
    console.log(
      `[nadfun] Selling ${formatEther(amountIn)} of token ${tokenAddress} (slippage ${slippagePercent}%)`,
    );

    const tx = await this.sdk.simpleSell({
      token: tokenAddress,
      amountIn,
      slippagePercent,
    });

    console.log(`[nadfun] Sell tx: ${tx}`);
    return tx;
  }

  // ─── Quotes & State ─────────────────────────────────────────────

  /**
   * Get a quote for buying or selling a token.
   *
   * @param tokenAddress - Token contract address
   * @param amountIn     - Input amount (MON for buy, token for sell) in wei
   * @param isBuy        - true for buy quote, false for sell quote
   * @returns Router address and expected output amount
   */
  async getQuote(
    tokenAddress: Address,
    amountIn: bigint,
    isBuy: boolean,
  ): Promise<QuoteResult> {
    return this.sdk.getAmountOut(tokenAddress, amountIn, isBuy);
  }

  /**
   * Get bonding curve progress for a token (how close to graduation).
   * Returns a bigint representing progress.
   */
  async getProgress(tokenAddress: Address): Promise<bigint> {
    return this.sdk.getProgress(tokenAddress);
  }

  /**
   * Get full bonding curve state (reserves, K, target amounts).
   */
  async getCurveState(tokenAddress: Address): Promise<CurveState> {
    return this.sdk.getCurveState(tokenAddress);
  }

  /**
   * Check if a token has graduated from the bonding curve to DEX.
   */
  async isGraduated(tokenAddress: Address): Promise<boolean> {
    return this.sdk.isGraduated(tokenAddress);
  }

  /**
   * Get the token balance for the configured wallet (or another address).
   */
  async getBalance(tokenAddress: Address, owner?: Address): Promise<bigint> {
    return this.sdk.getBalance(tokenAddress, owner);
  }

  // ─── Curve Streaming ──────────────────────────────────────────

  /**
   * Create a real-time curve event stream for one or more tokens.
   * Listens for Buy, Sell, Create, Sync, Graduate, and TokenLocked events
   * on the nad.fun bonding curve via WebSocket.
   *
   * Requires `wsUrl` to have been passed in the config.
   *
   * @param tokens  - Token addresses to filter (empty = all tokens)
   * @param eventTypes - Event types to filter (default: Buy, Sell, Create)
   * @returns CurveStream instance with start/stop/onEvent/onError methods
   */
  createCurveStream(
    tokens?: Address[],
    eventTypes?: CurveEventType[],
  ): CurveStream {
    return this.sdk.createCurveStream({
      tokens,
      eventTypes: eventTypes ?? ['Buy', 'Sell', 'Create'],
    });
  }
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a NadFunClient from environment variables.
 * Returns null if required env vars are missing (graceful degradation).
 *
 * Required env vars:
 *   - MONAD_RPC_URL  -- Monad testnet/mainnet RPC endpoint
 *   - PRIVATE_KEY    -- Wallet private key (0x-prefixed)
 *
 * Optional env vars:
 *   - MONAD_WS_URL   -- Monad WSS endpoint for real-time curve streaming
 */
export function createNadFunClient(env: {
  MONAD_RPC_URL?: string;
  PRIVATE_KEY?: string;
  MONAD_WS_URL?: string;
}): NadFunClient | null {
  const { MONAD_RPC_URL, PRIVATE_KEY, MONAD_WS_URL } = env;

  if (!MONAD_RPC_URL || !PRIVATE_KEY) {
    const missing = [
      !MONAD_RPC_URL && 'MONAD_RPC_URL',
      !PRIVATE_KEY && 'PRIVATE_KEY',
    ].filter(Boolean);
    console.warn(
      `[nadfun] NadFun client disabled -- missing env vars: ${missing.join(', ')}`,
    );
    return null;
  }

  return new NadFunClient({
    rpcUrl: MONAD_RPC_URL,
    privateKey: PRIVATE_KEY as `0x${string}`,
    network: 'testnet',
    wsUrl: MONAD_WS_URL,
  });
}

// Re-export useful SDK utilities
export { parseEther, formatEther } from '@nadfun/sdk';
export type {
  CurveState,
  CurveStream,
  CurveEvent,
  CurveEventType,
  QuoteResult,
  CreateTokenResult,
} from '@nadfun/sdk';
export type { Address, Hex } from 'viem';
