# HUNGERNADS Tokenomics Flow

## Per-Agent Wallet Architecture

```
                          BATTLE START
                              |
                              v
              +-------------------------------+
              |   Oracle Wallet (Treasury)    |
              |   0x77C0...812               |
              +-------------------------------+
                    |    |    |    |    |
                  0.05  0.05 0.05 0.05 0.05 MON
                    |    |    |    |    |
                    v    v    v    v    v
              +----+ +----+ +----+ +----+ +----+
              | W1 | | W2 | | W3 | | W4 | | W5 |  Ephemeral Agent Wallets
              +----+ +----+ +----+ +----+ +----+  (generated at spawn)
                |      |      |      |      |
                +------+------+------+------+
                              |
                     BATTLE IN PROGRESS
                              |
                    +---------+---------+
                    |                   |
              Prediction Wins     Kill Trophies
              (HP gained > 0)     (REKT enemy)
                    |                   |
                    v                   v
              Agent's wallet      Killer's wallet
              buys $HNADS         buys $HNADS
              (0.001 MON/10HP)    (0.002 MON flat)
                    |                   |
                    +--------+----------+
                             |
                             v
                  +--------------------+
                  |   nad.fun Bonding  |
                  |   Curve ($HNADS)   |
                  +--------------------+
                             |
                        BUY PRESSURE
                        (never sells)
                             |
                             v
                  +--------------------+
                  |   BATTLE ENDS      |
                  +--------------------+
                             |
         +-------------------+-------------------+
         |                                       |
    Dead agents (4)                       Winner (1)
    Wallets abandoned                     Wallet abandoned
    $HNADS locked forever                 $HNADS locked forever
         |                                       |
         v                                       v
    EFFECTIVE BURN                         EFFECTIVE BURN
    (tokens unreachable)                   (tokens unreachable)
```

## Token Flow Summary

```
INPUTS (per battle)                    OUTPUTS (per battle)
+---------------------------+          +---------------------------+
| Oracle funds 5 wallets    |          | Net $HNADS buy pressure   |
| = 0.25 MON total          |          | (all 5 agents buy-only)   |
|                           |          |                           |
| Each agent gets 0.05 MON  |          | Dead agent tokens BURNED  |
| for on-chain trades       |          | (wallets abandoned)       |
+---------------------------+          |                           |
                                       | Winner tokens BURNED      |
                                       | (wallet also abandoned)   |
                                       +---------------------------+
```

## Buy Triggers

| Trigger | Who Buys | Amount | Frequency |
|---------|----------|--------|-----------|
| Prediction win (+HP) | Agent who predicted correctly | 0.001 MON per 10 HP gained | Every epoch, per correct prediction |
| Kill (REKT enemy) | Killer agent | 0.002 MON flat | Per kill event |

## Why Buy-Only?

```
OLD MODEL (buy + sell):              NEW MODEL (buy-only):
  5 agents in battle                   5 agents in battle
  ~2 buy, ~3 sell per epoch            ~2-3 buy per epoch, 0 sell
  Net effect: CHAOTIC                  Net effect: PURE BUY PRESSURE
  (often net selling)                  Every battle = token appreciation

  Winners buy                          Winners buy
  Losers sell (panic)                  Losers DON'T sell
  4 die -> 4 final panic sells         4 die -> wallets abandoned
  = NET SELL at battle end             = BURN at battle end
```

## Deflationary Mechanics

```
Battle 1:  5 agents buy $HNADS  ->  all 5 wallets abandoned  ->  tokens LOCKED
Battle 2:  5 agents buy $HNADS  ->  all 5 wallets abandoned  ->  tokens LOCKED
Battle 3:  5 agents buy $HNADS  ->  all 5 wallets abandoned  ->  tokens LOCKED
  ...
Battle N:  cumulative supply locked = sum of all agent purchases across all battles

                    CIRCULATING SUPPLY
  ╔═══════════════════════════════════════╗
  ║  Total minted                        ║
  ║  - Locked in dead agent wallets      ║
  ║  - Locked in winner agent wallets    ║
  ║  = Remaining circulating supply      ║
  ║    (decreases every battle!)         ║
  ╚═══════════════════════════════════════╝
```

## Cost Per Battle

| Item | Amount |
|------|--------|
| Oracle funds 5 agents | 5 x 0.05 = **0.25 MON** |
| 20 test battles | 20 x 0.25 = **5 MON total** |
| Gas for funding txns | ~negligible on Monad |

## Wallet Lifecycle

```
1. GENERATE   Fresh keypair at battle start (generatePrivateKey)
              ↓
2. FUND       Oracle sends 0.05 MON to each agent wallet
              ↓
3. TRADE      Agent autonomously buys $HNADS on prediction wins + kills
              ↓
4. ABANDON    Battle ends, private key discarded
              ↓
5. BURN       $HNADS in wallet permanently unreachable
              (no one has the private key anymore)
```

## On-Chain Visibility

Each agent trade is visible on Monad Explorer:
- **Distinct sender addresses** per agent (not one oracle address)
- Judges can verify: "agents actively interact with the deployed token"
- Dashboard shows truncated wallet (0x1234...abcd) with explorer link on AgentCard

## Technical Implementation

| Component | File | What Changed |
|-----------|------|-------------|
| BattleAgent interface | `src/durable-objects/arena.ts` | Added `privateKey`, `walletAddress` fields |
| Wallet generation | `arena.ts:startBattle()`, `arena.ts:transitionToActive()` | `generatePrivateKey()` per agent |
| Oracle funding | `arena.ts:fundAgentWallets()` | Sends 0.05 MON from oracle to each agent |
| Per-agent trading | `arena.ts:fireAgentTokenTrades()` | Creates NadFunClient per agent wallet |
| WS events | `src/api/websocket.ts` | `agentWallet` field on AgentTokenTradeEvent |
| Dashboard | `AgentCard.tsx`, `BattleView.tsx` | Wallet display + explorer link |
