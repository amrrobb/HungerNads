/**
 * HUNGERNADS - Client-side Providers
 *
 * Wraps the app with wagmi (wallet) and react-query (caching) providers.
 * This is a client component because providers use React context.
 * Must be placed inside the root layout body.
 */

'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig, queryClient } from '@/lib/wallet';

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
