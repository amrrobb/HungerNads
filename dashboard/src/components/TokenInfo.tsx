/**
 * HUNGERNADS - TokenInfo Header Widget
 *
 * Displays in the nav bar:
 *   - Current $HNADS bonding curve price (MON per token)
 *   - Connected wallet's $HNADS balance (via ERC-20 balanceOf)
 *   - Graduation progress bar when token is still on bonding curve
 *
 * Data sources:
 *   - GET /token/price   (via useTokenPrice hook)
 *   - GET /token/progress (via useTokenPrice hook)
 *   - wagmi useReadContract (ERC-20 balanceOf for connected wallet)
 */

'use client';

import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { HNADS_TOKEN_ADDRESS } from '@/lib/wallet';
import useTokenPrice from '@/hooks/useTokenPrice';

// Minimal ERC-20 ABI — only balanceOf
const erc20BalanceAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  if (price < 0.000001) return '<0.000001';
  if (price < 0.01) return price.toFixed(6);
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}

function formatBalance(raw: bigint, decimals: number = 18): string {
  const value = parseFloat(formatUnits(raw, decimals));
  if (value === 0) return '0';
  if (value < 0.01) return '<0.01';
  if (value < 1_000) return value.toFixed(2);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

// ─── Component ───────────────────────────────────────────────────────

export default function TokenInfo() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected } = useAccount();

  useEffect(() => setMounted(true), []);
  const {
    pricePerToken,
    graduated,
    graduationPercent,
    loading: priceLoading,
    error: priceError,
  } = useTokenPrice();

  // ERC-20 balance for connected wallet
  const isZeroAddress =
    HNADS_TOKEN_ADDRESS === '0x0000000000000000000000000000000000000000';
  const { data: balanceRaw } = useReadContract({
    address: HNADS_TOKEN_ADDRESS,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [address!],
    query: {
      enabled: isConnected && !!address && !isZeroAddress,
      refetchInterval: 30_000,
    },
  });

  // Don't render anything until we have at least attempted a price fetch
  // and the token address is configured
  if (isZeroAddress && !priceLoading) return null;

  // Skeleton / loading state
  if (priceLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-4 w-20 animate-pulse rounded bg-colosseum-surface-light" />
      </div>
    );
  }

  // API unreachable — silently collapse (don't break the nav)
  if (priceError || pricePerToken === null) return null;

  return (
    <div className="flex items-center gap-3">
      {/* ── Price ── */}
      <div className="flex items-center gap-1.5" title="$HNADS price (bonding curve)">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gold">
          $HNADS
        </span>
        <span className="text-xs font-medium text-gray-300">
          {formatPrice(pricePerToken)} MON
        </span>
      </div>

      {/* ── Graduation Progress ── */}
      {graduated === false && graduationPercent !== null && (
        <div
          className="hidden items-center gap-1.5 sm:flex"
          title={`Bonding curve ${graduationPercent.toFixed(1)}% — graduates to DEX at 100%`}
        >
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-colosseum-surface-light">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-dark to-gold transition-all duration-700"
              style={{ width: `${Math.min(graduationPercent, 100)}%` }}
            />
          </div>
          <span className="text-[10px] tabular-nums text-gray-500">
            {graduationPercent.toFixed(0)}%
          </span>
        </div>
      )}

      {graduated === true && (
        <span className="hidden text-[10px] font-bold uppercase tracking-wider text-green-400 sm:inline">
          DEX
        </span>
      )}

      {/* ── Wallet Balance ── */}
      {mounted && isConnected && balanceRaw != null && (
        <div
          className="flex items-center gap-1 border-l border-colosseum-surface-light pl-2"
          title="Your $HNADS balance"
        >
          <span className="text-[10px] text-gray-500">BAL</span>
          <span className="text-xs font-medium text-gray-300">
            {formatBalance(balanceRaw as bigint)}
          </span>
        </div>
      )}
    </div>
  );
}
