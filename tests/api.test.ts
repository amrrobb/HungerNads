#!/usr/bin/env tsx
/**
 * HUNGERNADS - API Route Tests
 *
 * Tests API route handlers using Hono's built-in request mechanism
 * with mocked D1 and Durable Object bindings.
 *
 * Since we can't easily run real D1 or DOs in a test environment,
 * we test:
 *   1. Route existence and response shapes
 *   2. Input validation (missing params, bad data)
 *   3. Error handling paths
 *   4. Static/health endpoints
 *
 * Run: npx tsx tests/api.test.ts
 */

import { Hono } from 'hono';

// ─── Test Utilities ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failed++;
    failures.push(message);
    console.log(`  FAIL: ${message}`);
  } else {
    passed++;
    console.log(`  PASS: ${message}`);
  }
}

function section(name: string): void {
  console.log(`\n--- ${name} ---`);
}

// ─── Mock D1 ─────────────────────────────────────────────────────────────────

/**
 * Minimal D1 mock that returns empty results for queries.
 * Enough to exercise route code paths without a real database.
 */
function createMockD1(): D1Database {
  const mockStatement = {
    bind: (..._args: unknown[]) => mockStatement,
    first: async () => null,
    all: async () => ({ results: [], success: true, meta: {} }),
    run: async () => ({ success: true, meta: {} }),
    raw: async () => [],
  };

  return {
    prepare: (_sql: string) => mockStatement,
    exec: async (_sql: string) => ({ count: 0, duration: 0 }),
    batch: async (_stmts: D1PreparedStatement[]) => [],
    dump: async () => new ArrayBuffer(0),
  } as unknown as D1Database;
}

// ─── Mock Durable Objects ────────────────────────────────────────────────────

function createMockDONamespace(): DurableObjectNamespace {
  return {
    idFromName: (_name: string) => ({} as DurableObjectId),
    idFromString: (_id: string) => ({} as DurableObjectId),
    newUniqueId: () => ({} as DurableObjectId),
    get: (_id: DurableObjectId) => ({
      fetch: async (_req: RequestInfo) => new Response(JSON.stringify({ status: 'mock' }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    }),
    jurisdiction: (_jurisdiction: string) => createMockDONamespace(),
  } as unknown as DurableObjectNamespace;
}

// ─── Build Test App ──────────────────────────────────────────────────────────

async function getTestApp() {
  // Import the actual router
  const { apiRouter } = await import('../src/api/routes');
  return apiRouter;
}

function createMockEnv() {
  return {
    DB: createMockD1(),
    AGENT_DO: createMockDONamespace(),
    ARENA_DO: createMockDONamespace(),
    CACHE: {} as KVNamespace,
    ENVIRONMENT: 'test',
    PYTH_ENDPOINT: 'https://hermes.pyth.network',
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Static Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

async function testHealthEndpoint(): Promise<void> {
  section('API: Health Endpoint');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/health', {}, env);
  assert(res.status === 200, 'GET /health should return 200');

  const body = await res.json() as Record<string, unknown>;
  assert(body.status === 'alive', 'Health status should be "alive"');
  assert(body.service === 'hungernads', 'Service should be "hungernads"');
  assert(typeof body.timestamp === 'string', 'Should include timestamp');
}

async function testRootEndpoint(): Promise<void> {
  section('API: Root Endpoint');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/', {}, env);
  assert(res.status === 200, 'GET / should return 200');

  const body = await res.json() as Record<string, unknown>;
  assert(body.name === 'HUNGERNADS', 'Name should be HUNGERNADS');
  assert(typeof body.endpoints === 'object', 'Should list endpoints');
  assert(body.version === '0.1.0', 'Version should be 0.1.0');
}

async function test404Endpoint(): Promise<void> {
  section('API: 404 Catch-All');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/nonexistent-route', {}, env);
  assert(res.status === 404, 'Unknown route should return 404');

  const body = await res.json() as Record<string, unknown>;
  assert(body.error === 'Not found', 'Should return "Not found" error');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Battle Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

async function testBattleStartValidation(): Promise<void> {
  section('API: POST /battle/start Validation');

  const app = await getTestApp();
  const env = createMockEnv();

  // Invalid: less than 2 classes
  const res = await app.request('/battle/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentClasses: ['WARRIOR'] }),
  }, env);
  assert(res.status === 400, 'Should reject < 2 agent classes with 400');

  const body = await res.json() as Record<string, unknown>;
  assert(typeof body.error === 'string', 'Should have error message');
}

async function testBattleStartDefault(): Promise<void> {
  section('API: POST /battle/start Default');

  const app = await getTestApp();
  const env = createMockEnv();

  // Default body (empty) - should create with all 5 classes
  const res = await app.request('/battle/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }, env);

  // With mock D1, this should succeed (insertBattle/insertAgent mock returns success)
  assert(res.status === 200, 'Default battle start should succeed');

  const body = await res.json() as Record<string, unknown>;
  assert(body.ok === true, 'Response should have ok: true');
  assert(typeof body.battleId === 'string', 'Should return battleId');
  assert(Array.isArray(body.agents), 'Should return agents array');
  assert((body.agents as unknown[]).length === 5, 'Should have 5 agents');
}

async function testBattleGetWithMock(): Promise<void> {
  section('API: GET /battle/:id');

  const app = await getTestApp();
  const env = createMockEnv();

  // Since our mock DO returns { status: 'mock' }, it should return that
  const res = await app.request('/battle/test-id', {}, env);
  assert(res.status === 200, 'GET /battle/:id should return 200 with mock DO');
}

async function testBattleEpochs(): Promise<void> {
  section('API: GET /battle/:id/epochs');

  const app = await getTestApp();
  const env = createMockEnv();

  // Mock D1 returns null for getBattle -> should 404
  const res = await app.request('/battle/nonexistent/epochs', {}, env);
  assert(res.status === 404, 'Should 404 for non-existent battle');

  const body = await res.json() as Record<string, unknown>;
  assert(body.error === 'Battle not found', 'Should return "Battle not found"');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Betting Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

async function testBetMissingFields(): Promise<void> {
  section('API: POST /bet Missing Fields');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/bet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ battleId: 'test' }),
  }, env);
  assert(res.status === 400, 'Should reject missing fields with 400');

  const body = await res.json() as Record<string, unknown>;
  assert(typeof body.error === 'string', 'Should have error message');
}

async function testBetInvalidAmount(): Promise<void> {
  section('API: POST /bet Invalid Amount');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/bet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleId: 'test',
      userAddress: '0xAlice',
      agentId: 'agent-1',
      amount: -5,
    }),
  }, env);
  assert(res.status === 400, 'Should reject negative amount with 400');
}

async function testBetBattleNotFound(): Promise<void> {
  section('API: POST /bet Battle Not Found');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/bet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleId: 'nonexistent',
      userAddress: '0xAlice',
      agentId: 'agent-1',
      amount: 100,
    }),
  }, env);
  assert(res.status === 404, 'Should 404 for non-existent battle');
}

async function testSponsorMissingFields(): Promise<void> {
  section('API: POST /sponsor Missing Fields');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/sponsor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ battleId: 'test' }),
  }, env);
  assert(res.status === 400, 'Should reject missing fields with 400');
}

async function testSponsorInvalidAmount(): Promise<void> {
  section('API: POST /sponsor Invalid Amount');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/sponsor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      battleId: 'test',
      agentId: 'agent-1',
      sponsorAddress: '0xAlice',
      amount: -10,
    }),
  }, env);
  assert(res.status === 400, 'Should reject negative amount with 400');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Query Endpoints
// ═══════════════════════════════════════════════════════════════════════════════

async function testUserBets(): Promise<void> {
  section('API: GET /user/:address/bets');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/user/0xAlice/bets', {}, env);
  assert(res.status === 200, 'Should return 200');

  const body = await res.json() as Record<string, unknown>;
  assert(body.userAddress === '0xAlice', 'Should return correct user address');
  assert(Array.isArray(body.bets), 'Should return bets array');
  assert(body.count === 0, 'Empty mock should return 0 bets');
}

async function testLeaderboardAgents(): Promise<void> {
  section('API: GET /leaderboard/agents');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/leaderboard/agents', {}, env);
  assert(res.status === 200, 'Should return 200');

  const body = await res.json() as Record<string, unknown>;
  assert(Array.isArray(body.leaderboard), 'Should return leaderboard array');
  assert(typeof body.count === 'number', 'Should return count');
}

async function testLeaderboardBettors(): Promise<void> {
  section('API: GET /leaderboard/bettors');

  const app = await getTestApp();
  const env = createMockEnv();

  const res = await app.request('/leaderboard/bettors', {}, env);
  assert(res.status === 200, 'Should return 200');

  const body = await res.json() as Record<string, unknown>;
  assert(Array.isArray(body.leaderboard), 'Should return leaderboard array');
  assert(typeof body.count === 'number', 'Should return count');
}

async function testWebSocketUpgradeRequired(): Promise<void> {
  section('API: GET /battle/:id/stream (no upgrade)');

  const app = await getTestApp();
  const env = createMockEnv();

  // Without WebSocket upgrade header
  const res = await app.request('/battle/test-id/stream', {}, env);
  assert(res.status === 426, 'Should return 426 Upgrade Required');

  const body = await res.json() as Record<string, unknown>;
  assert(body.error === 'Expected WebSocket upgrade', 'Should indicate upgrade needed');
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests(): Promise<void> {
  console.log('HUNGERNADS - API Route Tests');
  console.log('===========================');

  // Static endpoints
  await testHealthEndpoint();
  await testRootEndpoint();
  await test404Endpoint();

  // Battle endpoints
  await testBattleStartValidation();
  await testBattleStartDefault();
  await testBattleGetWithMock();
  await testBattleEpochs();

  // Betting endpoints
  await testBetMissingFields();
  await testBetInvalidAmount();
  await testBetBattleNotFound();
  await testSponsorMissingFields();
  await testSponsorInvalidAmount();

  // Query endpoints
  await testUserBets();
  await testLeaderboardAgents();
  await testLeaderboardBettors();
  await testWebSocketUpgradeRequired();

  // Summary
  console.log('\n===========================');
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);

  if (failures.length > 0) {
    console.log('\nFAILURES:');
    for (const f of failures) {
      console.log(`  - ${f}`);
    }
    process.exit(1);
  } else {
    console.log('All tests passed!');
  }
}

runAllTests().catch((err) => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
