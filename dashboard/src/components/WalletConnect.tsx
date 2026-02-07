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

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletConnect() {
  const { address, isConnected, chain } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

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
