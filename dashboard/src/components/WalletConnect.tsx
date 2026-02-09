/**
 * HUNGERNADS - WalletConnect Button
 *
 * Minimal wallet connection button that:
 *   - Shows "Connect Wallet" when disconnected
 *   - Shows truncated address + chain indicator when connected
 *   - Handles connect/disconnect via wagmi hooks
 *   - Styled to match the colosseum dark theme
 */

'use client';

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { monadTestnet } from '@/lib/wallet';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletConnect() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected, chain } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  useEffect(() => setMounted(true), []);

  // Auto-switch to Monad testnet if connected to wrong chain
  useEffect(() => {
    if (mounted && isConnected && chain && chain.id !== monadTestnet.id) {
      switchChain({ chainId: monadTestnet.id });
    }
  }, [mounted, isConnected, chain, switchChain]);

  // Render the disconnected state on server to avoid hydration mismatch.
  // wagmi may restore a connected wallet on the client before the first paint.
  if (!mounted) {
    return (
      <button
        disabled
        className="rounded border border-gold/30 bg-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gold transition-all hover:bg-gold/20 active:scale-[0.98] disabled:opacity-60"
      >
        Connect Wallet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        {/* Chain indicator */}
        {chain && (
          <span className="hidden sm:inline rounded bg-green-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-400">
            {chain.name}
          </span>
        )}

        {/* Address + disconnect */}
        <button
          onClick={() => disconnect()}
          className="group flex items-center gap-1.5 rounded border border-colosseum-surface-light bg-colosseum-surface px-3 py-1.5 text-xs font-mono transition-colors hover:border-blood/50"
          title="Click to disconnect"
        >
          {/* Green dot */}
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-gray-300 group-hover:text-white">
            {truncateAddress(address)}
          </span>
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => connect({ connector: injected() })}
      disabled={isConnecting}
      className="rounded border border-gold/30 bg-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-gold transition-all hover:bg-gold/20 active:scale-[0.98] disabled:opacity-60"
    >
      {isConnecting ? 'Connecting...' : 'Connect Wallet'}
    </button>
  );
}
