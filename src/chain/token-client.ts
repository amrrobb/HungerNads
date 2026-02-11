/**
 * HUNGERNADS - Token Client
 *
 * Abstraction layer for $HNADS token operations. MockTokenClient calls
 * public mint() on HNADSMock (testnet). A real NadFunTokenClient would
 * replace it post-hackathon.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Transport,
  type Chain,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { monadTestnet } from './client';

// ─── HNADSMock ABI (minimal) ──────────────────────────────────────

const hnadsMockAbi = [
  {
    type: 'function',
    name: 'mint',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'burn',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

// ─── TokenClient Interface ─────────────────────────────────────────

export interface TokenClient {
  /** Distribute (mint/transfer) tokens to a recipient. */
  distribute(to: Address, amount: bigint): Promise<Hash>;

  /** Read the ERC20 balance of an address. */
  getBalance(address: Address): Promise<bigint>;
}

// ─── MockTokenClient ───────────────────────────────────────────────

export interface MockTokenConfig {
  rpcUrl: string;
  privateKey: Hex;
  tokenAddress: Address;
}

export class MockTokenClient implements TokenClient {
  private readonly publicClient: PublicClient<Transport, Chain>;
  private readonly walletClient: WalletClient<Transport, Chain, PrivateKeyAccount>;
  private readonly tokenAddress: Address;

  constructor(config: MockTokenConfig) {
    this.tokenAddress = config.tokenAddress;

    const account = privateKeyToAccount(config.privateKey);

    const chain = {
      ...monadTestnet,
      rpcUrls: {
        default: {
          http: [config.rpcUrl],
        },
      },
    } as const;

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    }) as PublicClient<Transport, Chain>;

    this.walletClient = createWalletClient({
      chain,
      transport: http(config.rpcUrl),
      account,
    }) as WalletClient<Transport, Chain, PrivateKeyAccount>;
  }

  async distribute(to: Address, amount: bigint): Promise<Hash> {
    const hash = await this.walletClient.writeContract({
      address: this.tokenAddress,
      abi: hnadsMockAbi,
      functionName: 'mint',
      args: [to, amount],
    });
    console.log(`[token] Minted ${amount} HNADS to ${to} — tx ${hash}`);
    return hash;
  }

  async getBalance(address: Address): Promise<bigint> {
    const balance = await this.publicClient.readContract({
      address: this.tokenAddress,
      abi: hnadsMockAbi,
      functionName: 'balanceOf',
      args: [address],
    });
    return balance;
  }
}

// ─── Factory ───────────────────────────────────────────────────────

export function createTokenClient(env: {
  MONAD_RPC_URL?: string;
  PRIVATE_KEY?: string;
  HNADS_TOKEN_ADDRESS?: string;
}): TokenClient | null {
  const { MONAD_RPC_URL, PRIVATE_KEY, HNADS_TOKEN_ADDRESS } = env;

  if (!MONAD_RPC_URL || !PRIVATE_KEY || !HNADS_TOKEN_ADDRESS) {
    const missing = [
      !MONAD_RPC_URL && 'MONAD_RPC_URL',
      !PRIVATE_KEY && 'PRIVATE_KEY',
      !HNADS_TOKEN_ADDRESS && 'HNADS_TOKEN_ADDRESS',
    ].filter(Boolean);
    console.warn(
      `[token] Token client disabled -- missing env vars: ${missing.join(', ')}`,
    );
    return null;
  }

  return new MockTokenClient({
    rpcUrl: MONAD_RPC_URL,
    privateKey: PRIVATE_KEY as Hex,
    tokenAddress: HNADS_TOKEN_ADDRESS as Address,
  });
}
