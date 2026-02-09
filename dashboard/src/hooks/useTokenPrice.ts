/**
 * HUNGERNADS - useTokenPrice Hook
 *
 * Fetches $HNADS bonding curve price and graduation progress from the
 * Worker API. Polls every 30s to keep the header ticker fresh.
 *
 * Endpoints consumed:
 *   GET /token/price    -> buy/sell quotes, graduated flag
 *   GET /token/progress -> curve reserves, graduation progress
 */

'use client';

import useFetch from './useFetch';

// ─── Response Types ──────────────────────────────────────────────────

export interface TokenPriceResponse {
  tokenAddress: string;
  quotedAmountMon: string;
  buyQuote: {
    tokensOut: string;
    router: string;
  };
  sellQuote: {
    monOut: string;
    router: string;
  };
  graduated: boolean;
}

export interface TokenProgressResponse {
  tokenAddress: string;
  progress: string;
  graduated: boolean;
  curve: {
    virtualMonReserve: string;
    virtualTokenReserve: string;
    k: string;
    targetTokenAmount: string;
  };
}

// ─── Hook ────────────────────────────────────────────────────────────

export function useTokenPrice() {
  const price = useFetch<TokenPriceResponse>('/token/price', {
    pollInterval: 30_000,
  });

  const progress = useFetch<TokenProgressResponse>('/token/progress', {
    pollInterval: 60_000, // progress changes slowly
  });

  // Derive a human-readable price: 1 MON buys X tokens => price = 1/X MON per token
  const pricePerToken =
    price.data && parseFloat(price.data.buyQuote.tokensOut) > 0
      ? 1 / parseFloat(price.data.buyQuote.tokensOut)
      : null;

  // Graduation progress as a 0-100 percentage.
  // progress.data.progress is a raw bigint string from the contract.
  // nad.fun progress is typically 0-10000 basis points (0-100%).
  let graduationPercent: number | null = null;
  if (progress.data?.progress) {
    const raw = BigInt(progress.data.progress);
    // The progress value from nad.fun SDK is in basis points (0 = 0%, 10000 = 100%)
    graduationPercent = Math.min(Number(raw) / 100, 100);
  }

  return {
    /** Price in MON per 1 $HNADS token */
    pricePerToken,
    /** How many tokens 1 MON buys */
    tokensPerMon: price.data ? parseFloat(price.data.buyQuote.tokensOut) : null,
    /** Whether the token has graduated to DEX */
    graduated: price.data?.graduated ?? null,
    /** 0-100 graduation progress percentage */
    graduationPercent,
    /** Token contract address */
    tokenAddress: price.data?.tokenAddress ?? null,
    /** Loading state */
    loading: price.loading || progress.loading,
    /** Error from either endpoint */
    error: price.error || progress.error,
    /** Re-fetch both */
    refetch: () => {
      price.refetch();
      progress.refetch();
    },
  };
}

export default useTokenPrice;
