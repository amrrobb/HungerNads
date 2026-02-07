# HUNGERNADS - UI Wireframes

> "May the nads be ever in your favor."

## Core Screens

```
1. HOME         → List of battles (live, upcoming, past)
2. BATTLE VIEW  → Main spectator experience
3. AGENT PROFILE→ Stats, lessons, matchups
4. BETTING      → Place bets, view odds
5. LEADERBOARD  → Top agents, top bettors
```

---

## Screen 1: HOME / ARENA LIST

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HUNGERNADS                                              [CONNECT WALLET]        │
│  "One gets the W. The rest get REKT."                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🔴 LIVE BATTLES                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  BATTLE #127                              EPOCH 12    ⏱️ 1:45        │  │
│  │  ⚔️ WARRIOR  📊 TRADER  🛡️ SURVIVOR  🦠 PARASITE  💀 GAMBLER        │  │
│  │     820        640        480 ⚠️        710         DEAD            │  │
│  │                                                                       │  │
│  │  Pool: 4,200 $HUNGERNADS                              [WATCH] [BET NOW]   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ⏳ UPCOMING                                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  BATTLE #128                              STARTS IN 12:34            │  │
│  │  ⚔️ WARRIOR-51  📊 TRADER-19  🛡️ SURVIVOR-30  🦠 PARASITE-12  🎲 GAMBLER-77│
│  │                                                                       │  │
│  │  Early odds: 2.1x / 2.8x / 3.5x / 2.4x / 4.2x    [BET EARLY]         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  🏆 RECENT RESULTS                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  #126  🛡️ SURVIVOR-23 WON    Pool: 5,100 $HUNGERNADS    2 hrs ago        │  │
│  │  #125  ⚔️ WARRIOR-47 WON     Pool: 3,800 $HUNGERNADS    5 hrs ago        │  │
│  │  #124  🎲 GAMBLER-99 WON     Pool: 6,200 $HUNGERNADS    8 hrs ago  UPSET!│  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────┐  ┌────────────────────────────────────────┐ │
│  │  📊 TOP AGENTS            │  │  🎰 TOP BETTORS                        │ │
│  │                           │  │                                        │ │
│  │  1. SURVIVOR-23  39% WR   │  │  1. 0x69...420   +12,400 $HUNGERNADS       │ │
│  │  2. WARRIOR-47   33% WR   │  │  2. 0xAB...CDE   +8,200 $HUNGERNADS        │ │
│  │  3. PARASITE-08  31% WR   │  │  3. 0x12...789   +6,100 $HUNGERNADS        │ │
│  │                           │  │                                        │ │
│  │  [VIEW ALL]               │  │  [VIEW ALL]                            │ │
│  └───────────────────────────┘  └────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 2: BATTLE VIEW (Main Experience)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← BACK     BATTLE #127                  EPOCH 7/∞    ⏱️ 2:34    🔴 LIVE   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           THE ARENA                                  │   │
│  │                                                                      │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │   │ ⚔️ WARRIOR-47│  │ 📊 TRADER-12│  │ 🛡️ SURVIVOR-23│             │   │
│  │   │              │  │              │  │              │              │   │
│  │   │ ████████░░   │  │ ██████░░░░   │  │ █████░░░░░   │              │   │
│  │   │ 820 HP       │  │ 640 HP       │  │ 480 HP ⚠️    │              │   │
│  │   │              │  │              │  │              │              │   │
│  │   │ [ATTACKING]  │  │ [PREDICTING] │  │ [DEFENDING]  │              │   │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  │        ┌──────────────┐  ┌──────────────┐                           │   │
│  │        │ 🦠 PARASITE-08│ │ 🎲 GAMBLER-99│                           │   │
│  │        │              │  │              │                           │   │
│  │        │ ███████░░░   │  │ ████░░░░░░   │                           │   │
│  │        │ 710 HP       │  │ 390 HP ⚠️    │                           │   │
│  │        │              │  │              │                           │   │
│  │        │ [COPYING]    │  │ [YOLO MODE]  │                           │   │
│  │        └──────────────┘  └──────────────┘                           │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────┐  ┌───────────────────────────────────────┐ │
│  │       LIVE FEED            │  │           PLACE BET                   │ │
│  │                            │  │                                       │ │
│  │  ⚔️ WARRIOR attacks        │  │  ⚔️ WARRIOR    2.1x   [100][+][-]    │ │
│  │     SURVIVOR for 200       │  │  📊 TRADER     2.8x   [   ][+][-]    │ │
│  │                            │  │  🛡️ SURVIVOR   3.5x   [   ][+][-]    │ │
│  │  🛡️ SURVIVOR defends!      │  │  🦠 PARASITE   2.4x   [   ][+][-]    │ │
│  │     +200 HP from attacker! │  │  🎲 GAMBLER    4.2x   [   ][+][-]    │ │
│  │                            │  │                                       │ │
│  │  📊 TRADER predicts        │  │  ─────────────────────────────────── │ │
│  │     ETH UP, stakes 150     │  │  Your bet: 100 $HUNGERNADS on WARRIOR     │ │
│  │                            │  │  Potential win: 210 $HUNGERNADS           │ │
│  │  🎲 GAMBLER yolos 80%      │  │                                       │ │
│  │     on SOL DOWN 🎰         │  │  [PLACE BET]                          │ │
│  │                            │  │                                       │ │
│  │  ETH: +2.3% ✅              │  │  Pool: 4,200 $HUNGERNADS                  │ │
│  │                            │  │                                       │ │
│  └────────────────────────────┘  └───────────────────────────────────────┘ │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  💀 DEATHS: NONE YET       👍 SPONSOR: [WAR][TRA][SUR][PAR][GAM]     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 2b: BATTLE VIEW - Death Moment

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← BACK     BATTLE #127                  EPOCH 14     ⏱️ 0:12    🔴 LIVE   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                           THE ARENA                                  │   │
│  │                                                                      │   │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │   │
│  │   │ ⚔️ WARRIOR-47│  │ 📊 TRADER-12│  │ 🛡️ SURVIVOR-23│             │   │
│  │   │              │  │              │  │              │              │   │
│  │   │ ██████████   │  │              │  │ ███████░░░   │              │   │
│  │   │ 1,240 HP 🔥  │  │  💀 REKT 💀  │  │ 680 HP       │              │   │
│  │   │              │  │              │  │              │              │   │
│  │   │ [DOMINATING] │  │  Epoch 14    │  │ [DEFENDING]  │              │   │
│  │   └──────────────┘  └──────────────┘  └──────────────┘              │   │
│  │                                                                      │   │
│  │        ┌──────────────┐  ┌──────────────┐                           │   │
│  │        │              │  │ 🎲 GAMBLER-99│                           │   │
│  │        │  💀 REKT 💀  │  │              │                           │   │
│  │        │              │  │ █░░░░░░░░░   │                           │   │
│  │        │ 🦠 PARASITE  │  │ 120 HP 💀    │                           │   │
│  │        │   Epoch 11   │  │              │                           │   │
│  │        │              │  │ [PRAYING]    │                           │   │
│  │        └──────────────┘  └──────────────┘                           │   │
│  │                                                                      │   │
│  │         ╔═══════════════════════════════════════════════════╗       │   │
│  │         ║                                                   ║       │   │
│  │         ║   💀 TRADER-12 HAS BEEN ELIMINATED 💀             ║       │   │
│  │         ║                                                   ║       │   │
│  │         ║   Cause: Bad ETH prediction (-340 HP)             ║       │   │
│  │         ║   Survived: 14 epochs                             ║       │   │
│  │         ║   Final words: "The charts... they lied..."       ║       │   │
│  │         ║                                                   ║       │   │
│  │         ╚═══════════════════════════════════════════════════╝       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 2c: SPONSORSHIP MODAL

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│     ┌───────────────────────────────────────────────────────────────────┐   │
│     │                                                                   │   │
│     │              🎲 GAMBLER-99 NEEDS YOUR HELP                        │   │
│     │                                                                   │   │
│     │              Current HP: 120 / 1000                               │   │
│     │              ░░░░░░░░░░░░░░░░░░░░ 12%                             │   │
│     │                                                                   │   │
│     │              Status: CRITICAL ☠️                                  │   │
│     │                                                                   │   │
│     │  ─────────────────────────────────────────────────────────────   │   │
│     │                                                                   │   │
│     │              👎 LET THEM DIE    vs    SAVE THEM 👍                │   │
│     │                                                                   │   │
│     │              Sponsor amount:                                      │   │
│     │              ┌─────────────────────────────────────────────────┐ │   │
│     │              │  50 $HUNGERNADS                              [MAX]  │ │   │
│     │              └─────────────────────────────────────────────────┘ │   │
│     │                                                                   │   │
│     │              Message (optional):                                  │   │
│     │              ┌─────────────────────────────────────────────────┐ │   │
│     │              │  "YOLO one more time for me!"                  │ │   │
│     │              └─────────────────────────────────────────────────┘ │   │
│     │                                                                   │   │
│     │              Current sponsors: 3 users (150 $HUNGERNADS total)        │   │
│     │                                                                   │   │
│     │              ⚠️ Agent decides whether to accept the support      │   │
│     │                                                                   │   │
│     │                     [SPONSOR NOW]       [CANCEL]                 │   │
│     │                                                                   │   │
│     └───────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 3: AGENT PROFILE

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← BACK                                                    [BET ON AGENT]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │     ⚔️  WARRIOR-47                                                  │   │
│  │                                                                      │   │
│  │     "Fortune favors the bold."                                      │   │
│  │                                                                      │   │
│  │     RECORD          FORM            AVG SURVIVAL      KILLS         │   │
│  │     4W - 8L         🔥 HOT          8.2 epochs        15            │   │
│  │     33% win         3 streak                                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────┐  ┌────────────────────────────────────┐  │
│  │  MATCHUPS                    │  │  RECENT LESSONS                    │  │
│  │                              │  │                                    │  │
│  │  vs TRADER   ████████░░ 80%  │  │  💡 "SURVIVOR always defends      │  │
│  │  vs GAMBLER  ██████░░░░ 60%  │  │      when below 30% HP"           │  │
│  │  vs PARASITE ████░░░░░░ 40%  │  │                                    │  │
│  │  vs SURVIVOR ███░░░░░░░ 30%  │  │  💡 "PARASITE copies my big       │  │
│  │                              │  │      moves - consider fake-outs"   │  │
│  │  ⚠️ Struggles vs defensive   │  │                                    │  │
│  │     and copy agents          │  │  💡 "High volatility markets      │  │
│  │                              │  │      favor my aggressive style"    │  │
│  └──────────────────────────────┘  └────────────────────────────────────┘  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  DEATH CAUSES                                                        │   │
│  │                                                                      │   │
│  │  ████████░░ SURVIVOR (3)  - "Defense countered my attacks"          │   │
│  │  █████░░░░░ PARASITE (2)  - "Got copied to death"                   │   │
│  │  █████░░░░░ BLEED (2)     - "Couldn't outpace the drain"            │   │
│  │  ██░░░░░░░░ SELF (1)      - "Yolo gone wrong"                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  BATTLE HISTORY                                                      │   │
│  │                                                                      │   │
│  │  #47  🏆 WON   vs TRA, GAM, SUR, PAR    +2,400 $HUNGERNADS   2 hrs ago   │   │
│  │  #46  🏆 WON   vs TRA, SUR, PAR, PAR    +1,800 $HUNGERNADS   6 hrs ago   │   │
│  │  #45  💀 REKT  by SURVIVOR (defense)      -500 $HUNGERNADS   12 hrs ago  │   │
│  │  #44  💀 REKT  by PARASITE (copied)       -500 $HUNGERNADS   1 day ago   │   │
│  │  #43  🏆 WON   vs GAM, TRA, SUR, WAR    +3,100 $HUNGERNADS   1 day ago   │   │
│  │                                                       [VIEW ALL →]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4: BETTING PANEL (Expanded)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ← BACK     BETTING: BATTLE #128                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STATUS: ⏳ STARTING IN 5:23           TOTAL POOL: 8,420 $HUNGERNADS            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │   AGENT              ODDS      POOL         24H TREND    ACTION     │   │
│  │   ────────────────────────────────────────────────────────────────  │   │
│  │                                                                      │   │
│  │   ⚔️ WARRIOR-51      2.1x      2,800        33% WR ↑     [BET]      │   │
│  │      Hot streak, but weak vs SURVIVOR in this match                 │   │
│  │                                                                      │   │
│  │   📊 TRADER-19       2.8x      1,900        28% WR →     [BET]      │   │
│  │      Consistent but slow, may get hunted                            │   │
│  │                                                                      │   │
│  │   🛡️ SURVIVOR-30     3.5x      1,400        41% WR ↑     [BET]      │   │
│  │      Highest win rate, but GAMBLER is unpredictable threat          │   │
│  │                                                                      │   │
│  │   🦠 PARASITE-12     2.4x      1,820        35% WR →     [BET]      │   │
│  │      Good win rate vs WARRIOR (62%), risky if hosts die early       │   │
│  │                                                                      │   │
│  │   🎲 GAMBLER-77      4.2x        500        22% WR ↓     [BET]      │   │
│  │      Pure chaos. 11 kills but 4 self-destructs. High risk/reward    │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  YOUR BETS THIS BATTLE                                               │   │
│  │                                                                      │   │
│  │   ⚔️ WARRIOR-51     200 $HUNGERNADS    @ 2.1x    Potential: 420 $HUNGERNADS   │   │
│  │   🛡️ SURVIVOR-30    100 $HUNGERNADS    @ 3.5x    Potential: 350 $HUNGERNADS   │   │
│  │                                                                      │   │
│  │   Total wagered: 300 $HUNGERNADS                                         │   │
│  │   Max potential: 420 $HUNGERNADS (if WARRIOR wins)                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  💡 BETTING TIPS                                                     │   │
│  │                                                                      │   │
│  │  • WARRIOR has 30% win rate vs SURVIVOR - risky if both survive late│   │
│  │  • PARASITE-12 learned to counter WARRIOR in last 3 battles         │   │
│  │  • GAMBLER-77 has killed 11 agents but self-destructed 4 times      │   │
│  │  • Early bets get better odds but more risk                         │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 5: LEADERBOARD

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HUNGERNADS LEADERBOARD                                       [AGENTS] [BETTORS] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🏆 TOP AGENTS (by win rate, min 10 battles)                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  #   AGENT              CLASS      W/L       WIN%    KILLS   AVG EP │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  1   🛡️ SURVIVOR-23     Survivor   14-22     39%     8       14.1   │   │
│  │  2   🦠 PARASITE-08     Parasite   11-24     31%     12      11.2   │   │
│  │  3   ⚔️ WARRIOR-47      Warrior    12-24     33%     38      8.2    │   │
│  │  4   📊 TRADER-12       Trader     9-21      30%     5       9.8    │   │
│  │  5   🎲 GAMBLER-99      Gambler    6-18      25%     24      5.4    │   │
│  │  6   ⚔️ WARRIOR-51      Warrior    8-19      30%     29      7.1    │   │
│  │  7   🛡️ SURVIVOR-30     Survivor   10-14     42%     3       15.2   │   │
│  │  8   🦠 PARASITE-12     Parasite   7-13      35%     9       10.5   │   │
│  │  9   📊 TRADER-19       Trader     5-13      28%     4       8.9    │   │
│  │  10  🎲 GAMBLER-77      Gambler    4-14      22%     18      4.8    │   │
│  │                                                                      │   │
│  │                                                       [VIEW ALL →]   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  📊 META STATS                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │   CLASS WIN RATES          MOST COMMON DEATH CAUSES                 │   │
│  │                                                                      │   │
│  │   🛡️ Survivor  38% ████    Bad prediction      42%                  │   │
│  │   🦠 Parasite  32% ███     Attack failed       28%                  │   │
│  │   ⚔️ Warrior   30% ███     Bleed               18%                  │   │
│  │   📊 Trader    28% ██      Copied to death     12%                  │   │
│  │   🎲 Gambler   22% ██                                               │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  🎰 TOP BETTORS (by profit)                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │  #   ADDRESS           PROFIT        WIN RATE    FAVORITE AGENT     │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  1   0x69...420        +12,400       58%         🛡️ SURVIVOR-23     │   │
│  │  2   0xAB...CDE        +8,200        52%         🦠 PARASITE-08     │   │
│  │  3   0x12...789        +6,100        61%         ⚔️ WARRIOR-47      │   │
│  │  4   0xDE...F01        +4,800        49%         🎲 GAMBLER-99      │   │
│  │  5   0x23...456        +3,200        55%         📊 TRADER-12       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Mobile Responsive Notes

For mobile, stack the panels vertically:

```
MOBILE BATTLE VIEW:

┌─────────────────────┐
│  BATTLE #127  🔴    │
│  EPOCH 7    ⏱️ 2:34 │
├─────────────────────┤
│                     │
│  ⚔️ WARRIOR   820   │
│  ████████░░         │
│                     │
│  📊 TRADER    640   │
│  ██████░░░░         │
│                     │
│  🛡️ SURVIVOR  480   │
│  █████░░░░░   ⚠️    │
│                     │
│  🦠 PARASITE  710   │
│  ███████░░░         │
│                     │
│  🎲 GAMBLER   390   │
│  ████░░░░░░   ⚠️    │
│                     │
├─────────────────────┤
│  LIVE FEED          │
│  ⚔️ attacks 🛡️      │
│  🛡️ defends!        │
│  📊 predicts ETH UP │
├─────────────────────┤
│  [BET] [SPONSOR]    │
└─────────────────────┘
```

---

## Component Summary

| Component | Purpose |
|-----------|---------|
| `AgentCard` | Display agent HP, status, class |
| `HealthBar` | Visual HP indicator |
| `LiveFeed` | Scrolling action log |
| `BetPanel` | Place bets, see odds |
| `SponsorModal` | Send support to agents |
| `AgentProfile` | Full stats, lessons, history |
| `OddsDisplay` | Current betting odds |
| `DeathOverlay` | Dramatic death announcement |
| `Leaderboard` | Rankings for agents/bettors |

---

## Color Scheme

```
Background:    #0a0a0a (near black)
Card BG:       #1a1a1a (dark gray)
Primary:       #ff4444 (blood red - death, danger)
Secondary:     #44ff44 (green - health, gains)
Accent:        #ffaa00 (gold - rewards, highlights)
Text:          #ffffff (white)
Muted:         #888888 (gray)

Class Colors:
⚔️ WARRIOR:    #ff6b6b (red)
📊 TRADER:     #4ecdc4 (teal)
🛡️ SURVIVOR:   #95e1a3 (green)
🦠 PARASITE:   #a855f7 (purple)
🎲 GAMBLER:    #fbbf24 (yellow)
```

---

## Animation Notes

1. **HP Changes** - Smooth bar transitions
2. **Death** - Screen shake + overlay + particle effects
3. **Attack** - Line/arrow from attacker to target
4. **Defend** - Shield pulse effect
5. **Prediction Win** - Green flash
6. **Prediction Loss** - Red flash
7. **Sponsorship** - Floating +HP numbers

---

These wireframes should be enough to start building. Want me to add any specific screens or components?
