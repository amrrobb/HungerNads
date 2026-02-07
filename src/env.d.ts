/**
 * Ambient type declarations for HUNGERNADS
 *
 * Declares `process.env` so that files like multi-provider.ts and
 * test-providers.ts compile cleanly under the Cloudflare Workers
 * tsconfig (which uses @cloudflare/workers-types, not @types/node).
 */

declare var process: {
  env: Record<string, string | undefined>;
  exit(code?: number): never;
};
