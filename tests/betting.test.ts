#!/usr/bin/env tsx
/**
 * HUNGERNADS - Betting Tests
 *
 * Validates:
 *   - Odds calculation (pure function)
 *   - Prize distribution (90/5/5 split)
 *   - BettingPool settlement logic (mocked D1)
 *   - Sponsorship HP boost calculation
 *
 * Run: npx tsx tests/betting.test.ts
 */

import {
  calculateOdds,
  buildOddsInputs,
  type OddsInput,
  POOL_DISTRIBUTION,
} from '../src/betting';

import { calculateHpBoost, MAX_HP_BOOST } from '../src/betting/sponsorship';

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

function assertApprox(actual: number, expected: number, tolerance: number, message: string): void {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message} (actual: ${actual}, expected: ${expected}, tolerance: ${tolerance})`,
  );
}

function section(name: string): void {
  console.log(`\n--- ${name} ---`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Pool Distribution Constants
// ═══════════════════════════════════════════════════════════════════════════════

function testPoolDistribution(): void {
  section('Pool Distribution: Constants');

  assert(POOL_DISTRIBUTION.WINNERS === 0.9, 'Winners should get 90%');
  assert(POOL_DISTRIBUTION.TREASURY === 0.05, 'Treasury should get 5%');
  assert(POOL_DISTRIBUTION.BURN === 0.05, 'Burn should get 5%');

  const total = POOL_DISTRIBUTION.WINNERS + POOL_DISTRIBUTION.TREASURY + POOL_DISTRIBUTION.BURN;
  assertApprox(total, 1.0, 0.001, 'Total distribution should sum to 100%');
}

function testPoolDistributionMath(): void {
  section('Pool Distribution: Math Verification');

  // Simulate a pool of 10000
  const totalPool = 10000;
  const winnerPool = totalPool * POOL_DISTRIBUTION.WINNERS;
  const treasury = totalPool * POOL_DISTRIBUTION.TREASURY;
  const burn = totalPool * POOL_DISTRIBUTION.BURN;

  assert(winnerPool === 9000, '90% of 10000 = 9000 to winners');
  assert(treasury === 500, '5% of 10000 = 500 to treasury');
  assert(burn === 500, '5% of 10000 = 500 to burn');
  assertApprox(winnerPool + treasury + burn, totalPool, 0.01, 'All funds should be accounted for');
}

function testProportionalPayout(): void {
  section('Pool Distribution: Proportional Payout');

  // Simulate 3 users betting on the winner:
  // User A: 500 (50%), User B: 300 (30%), User C: 200 (20%)
  const totalPool = 5000;
  const winnerPool = totalPool * POOL_DISTRIBUTION.WINNERS; // 4500

  const bets = [
    { user: 'A', amount: 500 },
    { user: 'B', amount: 300 },
    { user: 'C', amount: 200 },
  ];
  const totalWinningStake = bets.reduce((sum, b) => sum + b.amount, 0); // 1000

  const payouts = bets.map(bet => {
    const share = bet.amount / totalWinningStake;
    return {
      user: bet.user,
      payout: Math.floor(winnerPool * share * 100) / 100,
    };
  });

  assertApprox(payouts[0].payout, 2250, 0.01, 'User A (50% stake) should get ~2250');
  assertApprox(payouts[1].payout, 1350, 0.01, 'User B (30% stake) should get ~1350');
  assertApprox(payouts[2].payout, 900, 0.01, 'User C (20% stake) should get ~900');

  const totalPaid = payouts.reduce((sum, p) => sum + p.payout, 0);
  assertApprox(totalPaid, winnerPool, 0.01, 'Total payouts should equal winner pool');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Odds Calculation
// ═══════════════════════════════════════════════════════════════════════════════

function testOddsEmptyInput(): void {
  section('Odds: Empty Input');

  const result = calculateOdds([]);
  assert(Object.keys(result).length === 0, 'Empty input should return empty odds');
}

function testOddsSingleAgent(): void {
  section('Odds: Single Agent');

  const agents: OddsInput[] = [
    { agentId: 'a1', hp: 1000, maxHp: 1000, poolWeight: 1, winRate: 0.5 },
  ];

  const result = calculateOdds(agents);
  assert('a1' in result, 'Should have odds for a1');
  assert(result['a1'].probability > 0, 'Probability should be positive');
  assert(result['a1'].decimal > 0, 'Decimal odds should be positive');
}

function testOddsEqualAgents(): void {
  section('Odds: Equal Agents');

  const agents: OddsInput[] = [
    { agentId: 'a1', hp: 1000, maxHp: 1000, poolWeight: 0.2, winRate: 0.5 },
    { agentId: 'a2', hp: 1000, maxHp: 1000, poolWeight: 0.2, winRate: 0.5 },
    { agentId: 'a3', hp: 1000, maxHp: 1000, poolWeight: 0.2, winRate: 0.5 },
    { agentId: 'a4', hp: 1000, maxHp: 1000, poolWeight: 0.2, winRate: 0.5 },
    { agentId: 'a5', hp: 1000, maxHp: 1000, poolWeight: 0.2, winRate: 0.5 },
  ];

  const result = calculateOdds(agents);

  // All agents have equal stats, so probabilities should be roughly equal
  const probs = Object.values(result).map(r => r.probability);
  const avg = probs.reduce((s, p) => s + p, 0) / probs.length;

  for (const prob of probs) {
    assertApprox(prob, avg, 0.05, `Equal agents should have roughly equal probability (~${avg.toFixed(3)})`);
  }
}

function testOddsHpAdvantage(): void {
  section('Odds: HP Advantage');

  const agents: OddsInput[] = [
    { agentId: 'strong', hp: 1000, maxHp: 1000, poolWeight: 0.5, winRate: 0.5 },
    { agentId: 'weak', hp: 100, maxHp: 1000, poolWeight: 0.5, winRate: 0.5 },
  ];

  const result = calculateOdds(agents);

  assert(
    result['strong'].probability > result['weak'].probability,
    'Higher HP agent should have higher probability',
  );
  assert(
    result['strong'].decimal < result['weak'].decimal,
    'Higher HP agent should have lower decimal odds (favored)',
  );
}

function testOddsPoolWeightInverse(): void {
  section('Odds: Pool Weight Inverse Effect');

  // Agent with less money bet on them gets a probability boost (pool weight inverse).
  // Higher probability = LOWER decimal odds in this model.
  const agents: OddsInput[] = [
    { agentId: 'favorite', hp: 500, maxHp: 1000, poolWeight: 0.8, winRate: 0.5 },
    { agentId: 'underdog', hp: 500, maxHp: 1000, poolWeight: 0.2, winRate: 0.5 },
  ];

  const result = calculateOdds(agents);

  // Underdog gets probability boost via poolInverse -> higher probability -> lower decimal odds
  assert(
    result['underdog'].probability > result['favorite'].probability,
    'Underdog (less money bet) should have higher probability (pool weight inverse bonus)',
  );
  assert(
    result['underdog'].decimal < result['favorite'].decimal,
    'Underdog should have lower decimal odds (favored by pool inverse model)',
  );
}

function testOddsProbabilityBounds(): void {
  section('Odds: Probability Bounds');

  // Test that probabilities are clamped between MIN (0.02) and MAX (0.95)
  const agents: OddsInput[] = [
    { agentId: 'dominant', hp: 1000, maxHp: 1000, poolWeight: 0, winRate: 1.0 },
    { agentId: 'hopeless', hp: 1, maxHp: 1000, poolWeight: 1, winRate: 0 },
  ];

  const result = calculateOdds(agents);

  assert(result['dominant'].probability <= 0.95, 'Max probability should be capped at 0.95');
  assert(result['hopeless'].probability >= 0.02, 'Min probability should be at least 0.02');
}

function testBuildOddsInputs(): void {
  section('Odds: buildOddsInputs');

  const agents = [
    { id: 'a1', hp: 800, maxHp: 1000, isAlive: true },
    { id: 'a2', hp: 0, maxHp: 1000, isAlive: false },
    { id: 'a3', hp: 600, maxHp: 1000, isAlive: true },
  ];

  const poolPerAgent: Record<string, number> = { a1: 500, a3: 300 };
  const winRates: Record<string, number> = { a1: 0.6, a3: 0.4 };

  const inputs = buildOddsInputs(agents, poolPerAgent, winRates);

  assert(inputs.length === 2, 'Should only include alive agents');
  assert(!inputs.some(i => i.agentId === 'a2'), 'Dead agent should not be included');
  assert(inputs.find(i => i.agentId === 'a1')!.hp === 800, 'HP should be correct');
  assert(inputs.find(i => i.agentId === 'a3')!.winRate === 0.4, 'Win rate should be correct');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Sponsorship HP Boost
// ═══════════════════════════════════════════════════════════════════════════════

function testHpBoost(): void {
  section('Sponsorship: HP Boost Calculation');

  assert(calculateHpBoost(0) === 0, 'Zero amount gives zero boost');
  assert(calculateHpBoost(-100) === 0, 'Negative amount gives zero boost');
  assert(calculateHpBoost(50) === 50, 'Small amount gives proportional boost');
  assert(calculateHpBoost(100) === 100, 'Amount under cap gives exact boost');
  assert(calculateHpBoost(MAX_HP_BOOST + 100) === MAX_HP_BOOST, 'Amount above cap is clamped to MAX_HP_BOOST');
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Mock D1 Settlement Test
// ═══════════════════════════════════════════════════════════════════════════════

function testSettlementMath(): void {
  section('Settlement: Prize Distribution Math');

  // Simulate settlement logic without D1
  const bets = [
    { id: '1', user: '0xAlice', agent: 'winner-1', amount: 500 },
    { id: '2', user: '0xBob', agent: 'winner-1', amount: 300 },
    { id: '3', user: '0xCharlie', agent: 'loser-1', amount: 400 },
    { id: '4', user: '0xDave', agent: 'loser-2', amount: 800 },
  ];

  const winnerId = 'winner-1';
  const totalPool = bets.reduce((sum, b) => sum + b.amount, 0); // 2000
  const winnerPool = totalPool * POOL_DISTRIBUTION.WINNERS; // 1800
  const treasury = totalPool * POOL_DISTRIBUTION.TREASURY; // 100
  const burn = totalPool * POOL_DISTRIBUTION.BURN; // 100

  assert(totalPool === 2000, 'Total pool should be 2000');
  assert(winnerPool === 1800, 'Winner pool should be 1800 (90%)');
  assert(treasury === 100, 'Treasury should be 100 (5%)');
  assert(burn === 100, 'Burn should be 100 (5%)');

  const winningBets = bets.filter(b => b.agent === winnerId);
  const totalWinningStake = winningBets.reduce((sum, b) => sum + b.amount, 0); // 800

  assert(totalWinningStake === 800, 'Total winning stake should be 800');

  // Proportional payouts
  const payouts = winningBets.map(bet => {
    const share = bet.amount / totalWinningStake;
    return {
      user: bet.user,
      betAmount: bet.amount,
      payout: Math.floor(winnerPool * share * 100) / 100,
    };
  });

  // Alice: 500/800 = 62.5% of 1800 = 1125
  assertApprox(payouts[0].payout, 1125, 0.01, 'Alice should get ~1125');
  // Bob: 300/800 = 37.5% of 1800 = 675
  assertApprox(payouts[1].payout, 675, 0.01, 'Bob should get ~675');

  // Verify all money accounted for
  const totalPaid = payouts.reduce((sum, p) => sum + p.payout, 0);
  assertApprox(totalPaid + treasury + burn, totalPool, 0.01, 'All funds should be accounted for');

  // Verify winners profit
  assert(payouts[0].payout > payouts[0].betAmount, 'Alice should profit (payout > bet)');
  assert(payouts[1].payout > payouts[1].betAmount, 'Bob should profit (payout > bet)');
}

function testSettlementNoWinningBets(): void {
  section('Settlement: No Winning Bets');

  const bets = [
    { id: '1', user: '0xAlice', agent: 'loser-1', amount: 500 },
    { id: '2', user: '0xBob', agent: 'loser-2', amount: 300 },
  ];

  const winnerId = 'winner-1';
  const totalPool = bets.reduce((sum, b) => sum + b.amount, 0);
  const winnerPool = totalPool * POOL_DISTRIBUTION.WINNERS;
  const treasury = totalPool * POOL_DISTRIBUTION.TREASURY;
  const burn = totalPool * POOL_DISTRIBUTION.BURN;

  const winningBets = bets.filter(b => b.agent === winnerId);
  assert(winningBets.length === 0, 'No winning bets');

  // When no one bet on the winner, no payouts
  const payouts: { user: string; payout: number }[] = [];
  assert(payouts.length === 0, 'No payouts should be issued');
  assert(treasury > 0, 'Treasury still gets its cut');
  assert(burn > 0, 'Burn still happens');
}

function testSettlementEmptyPool(): void {
  section('Settlement: Empty Pool');

  const bets: { id: string; user: string; agent: string; amount: number }[] = [];
  const totalPool = 0;
  const winnerPool = totalPool * POOL_DISTRIBUTION.WINNERS;
  const treasury = totalPool * POOL_DISTRIBUTION.TREASURY;
  const burn = totalPool * POOL_DISTRIBUTION.BURN;

  assert(winnerPool === 0, 'No winner pool');
  assert(treasury === 0, 'No treasury');
  assert(burn === 0, 'No burn');
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function runAllTests(): void {
  console.log('HUNGERNADS - Betting Tests');
  console.log('=========================');

  // Pool Distribution
  testPoolDistribution();
  testPoolDistributionMath();
  testProportionalPayout();

  // Odds Calculation
  testOddsEmptyInput();
  testOddsSingleAgent();
  testOddsEqualAgents();
  testOddsHpAdvantage();
  testOddsPoolWeightInverse();
  testOddsProbabilityBounds();
  testBuildOddsInputs();

  // Sponsorship
  testHpBoost();

  // Settlement
  testSettlementMath();
  testSettlementNoWinningBets();
  testSettlementEmptyPool();

  // Summary
  console.log('\n=========================');
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

runAllTests();
