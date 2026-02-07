# CLAUDE.md - Instructions for Claude Code

## Project: HUNGERNADS

> "May the nads be ever in your favor."

AI gladiator colosseum on Monad. Agents fight to survive. Nads bet and sponsor. Agents learn and evolve. Last nad standing wins.

**Hackathon:** Moltiverse (Monad + nad.fun)
**Token:** $HNADS on nad.fun
**Future rebrand:** WREKT (for multi-chain)

---

## Quick Context

**What is this?**
- Hackathon project for Moltiverse (Monad + nad.fun)
- $200K prize pool, Agent+Token track
- Deadline: Feb 15, 2026
- Rolling judging (ship fast!)

**The Colosseum Concept:**
```
THE CROWD (Users)        → Bet, sponsor, watch
THE ARENA (Battle)       → 5 AI agents fight
THE GLADIATORS (Agents)  → Predict, attack, defend, die
THE EMPEROR (Contract)   → Enforces rules, distributes rewards
```

---

## Project Structure

```
hungernads/
├── CLAUDE.md                     # This file (read first)
├── QUICKSTART.md                 # First 24 hours priorities
├── docs/
│   ├── PROJECT_OVERVIEW.md       # Vision and full concept
│   ├── TECHNICAL_ARCHITECTURE.md # System design
│   ├── IMPLEMENTATION_PLAN.md    # Timeline and tasks
│   ├── AGENT_CLASSES.md          # Agent specifications
│   └── UI_WIREFRAMES.md          # Interface designs
├── src/
│   ├── index.ts                  # Worker entry point
│   ├── agents/
│   │   ├── base-agent.ts         # Abstract agent class
│   │   ├── warrior.ts            # Aggressive agent
│   │   ├── trader.ts             # Technical analysis agent
│   │   ├── survivor.ts           # Defensive agent
│   │   ├── parasite.ts           # Copy-trading agent
│   │   ├── gambler.ts            # Random chaos agent
│   │   └── personalities.ts      # LLM prompts
│   ├── arena/
│   │   ├── arena.ts              # Battle management
│   │   ├── epoch.ts              # Epoch processing
│   │   ├── combat.ts             # Attack/defend resolution
│   │   └── death.ts              # Death mechanics
│   ├── learning/
│   │   ├── memory.ts             # Agent memory system
│   │   ├── lessons.ts            # Lesson extraction
│   │   └── profiles.ts           # Public profile generation
│   ├── betting/
│   │   ├── pool.ts               # Betting pool logic
│   │   ├── odds.ts               # Odds calculation (live)
│   │   └── sponsorship.ts        # Hunger Games style support
│   ├── durable-objects/
│   │   ├── agent.ts              # Agent Durable Object
│   │   └── arena.ts              # Arena Durable Object
│   ├── llm/
│   │   └── provider.ts           # AI SDK integration
│   ├── api/
│   │   ├── routes.ts             # API endpoints
│   │   └── websocket.ts          # Real-time updates
│   └── db/
│       ├── schema.ts             # D1 queries
│       └── migrations/           # Database migrations
├── contracts/
│   ├── HungernadsArena.sol       # Main arena contract
│   └── HungernadsBetting.sol     # Betting + sponsorship
├── dashboard/
│   └── [Next.js app]             # Spectator frontend
├── wrangler.toml                 # Cloudflare config
├── package.json
└── tsconfig.json
```

---

## Core Game Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                      BATTLE FLOW                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. BATTLE STARTS                                               │
│     • 5 agents spawn with 1000 HP each                          │
│     • Betting opens                                             │
│     • Nads place initial bets                                   │
│                                                                  │
│  2. EACH EPOCH (every ~5 minutes)                               │
│     a. Agents observe: market data + other agents               │
│     b. Agents decide: PREDICT + optional ATTACK/DEFEND          │
│     c. Execute predictions (paper trading vs real prices)       │
│     d. Resolve combat (attack vs defend)                        │
│     e. Apply bleed (2% HP drain)                                │
│     f. Check deaths (HP ≤ 0 = REKT)                             │
│     g. Update odds                                              │
│     h. Broadcast to viewers                                     │
│                                                                  │
│  3. BATTLE ENDS                                                 │
│     • Last nad standing wins                                    │
│     • Betting pool distributed                                  │
│     • Agents extract lessons                                    │
│     • Update agent profiles                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Actions Per Epoch

```typescript
interface EpochActions {
  // REQUIRED: Market prediction
  prediction: {
    asset: 'ETH' | 'BTC' | 'SOL' | 'MON';
    direction: 'UP' | 'DOWN';
    stake: number;  // 5-50% of HP
  };
  
  // OPTIONAL: Combat
  attack?: {
    target: AgentId;
    stake: number;  // Amount to risk/steal
  };
  
  defend?: boolean;  // Costs 5% HP, blocks all attacks
  
  // For logging
  reasoning: string;
}
```

---

## Agent Classes Quick Reference

| Class | Risk | Predict | Attack | Defend | Special |
|-------|------|---------|--------|--------|---------|
| ⚔️ WARRIOR | High | Big stakes | Hunts weak | Rarely | Aggressive killer |
| 📊 TRADER | Medium | TA-based | Never | Sometimes | Ignores others |
| 🛡️ SURVIVOR | Low | Tiny stakes | Never | Always | Outlast everyone |
| 🦠 PARASITE | Low | Copies best | Scraps only | If targeted | Needs hosts |
| 🎲 GAMBLER | Chaos | Random | Random | Random | Wildcard |

See `docs/AGENT_CLASSES.md` for full specs and LLM prompts.

---

## Agent Learning System

```typescript
interface AgentMemory {
  agentId: string;
  
  // Historical data
  battles: BattleRecord[];
  lessons: Lesson[];
  
  // Computed stats (shown to users)
  matchups: Map<AgentClass, WinLossRecord>;
  deathCauses: Map<string, number>;
  avgSurvival: number;
  
  // Fed to LLM each battle
  getContext(): string;
}

interface Lesson {
  battleId: string;
  context: string;      // "Attacked SURVIVOR at 25% HP"
  outcome: string;      // "They defended, I lost 200"
  learning: string;     // "SURVIVOR defends when desperate"
  applied: string;      // "Reduced attack vs low-HP SURVIVOR"
}
```

**Key insight:** Lessons are PUBLIC. Nads can see what agents learned to inform betting decisions.

---

## Betting System

```typescript
interface BettingPool {
  battleId: string;
  totalPool: number;
  
  // Bets by agent
  bets: Map<AgentId, Bet[]>;
  
  // Live odds (recalculated each epoch)
  odds: Map<AgentId, number>;
  
  // Methods
  placeBet(user: Address, agent: AgentId, amount: number): void;
  calculateOdds(): Map<AgentId, number>;
  distributePrizes(winner: AgentId): void;
}

// Distribution
// 90% to winners
// 5% protocol treasury
// 5% burn 🔥
```

---

## API Endpoints

```typescript
// Battle Management
POST /battle/start              // Start new battle
GET  /battle/:id                // Get battle state
WS   /battle/:id/stream         // Real-time updates

// Agent Info
GET  /agent/:id                 // Full profile
GET  /agent/:id/lessons         // Learning history
GET  /agent/:id/matchups        // Win rates vs each class

// Betting
POST /bet                       // Place bet
GET  /battle/:id/odds           // Current odds
GET  /user/:address/bets        // User's bet history

// Sponsorship
POST /sponsor                   // Send support
GET  /battle/:id/sponsors       // Sponsorship feed

// Leaderboard
GET  /leaderboard/agents        // Top agents by win rate
GET  /leaderboard/bettors       // Top bettors by profit
```

---

## LLM Integration

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function agentDecide(
  agent: Agent,
  marketData: MarketData,
  arenaState: ArenaState
): Promise<EpochActions> {
  
  const prompt = `
MARKET: ETH ${ethPrice}, BTC ${btcPrice}, SOL ${solPrice}, MON ${monPrice}
YOUR HP: ${agent.hp}/1000
YOUR LESSONS: ${agent.lessons.slice(-3).map(l => l.learning).join('; ')}

OTHER AGENTS:
${others.map(a => `- ${a.name} (${a.class}): ${a.hp} HP`).join('\n')}

ACTIONS:
1. PREDICT: asset, direction (UP/DOWN), stake (5-50% of HP)
2. ATTACK: target name, stake amount (optional)
3. DEFEND: true/false, costs 5% HP (optional)

Respond JSON only.
`;

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: agent.personality,
    prompt,
  });
  
  return parseActions(text);
}
```

---

## Key Technical Decisions

### Why Cloudflare Workers + Durable Objects?
- 24/7 agent operation without servers
- Persistent state between requests
- WebSocket support for live updates
- Global edge deployment

### Why Paper Trading?
- Safe for hackathon demo
- Real price feeds (Pyth), simulated execution
- Can switch to real post-hackathon

### Why Transparent Learning?
- Creates skill-based betting (study agents)
- Differentiates from pure gambling
- Generates content (community discusses meta)

---

## MVP Checklist

- [ ] 5 preset agent classes working
- [ ] Battle mechanics (predict/attack/defend)
- [ ] Agent learning (lessons stored + displayed)
- [ ] Betting with live odds
- [ ] Basic sponsorship
- [ ] Spectator dashboard
- [ ] $HNADS on nad.fun
- [ ] Demo video

---

## Coding Guidelines

### Error Handling
```typescript
try {
  const actions = await agentDecide(agent, market, arena);
  return actions;
} catch (error) {
  console.error('Agent decision failed:', error);
  return getDefaultActions(agent);  // Safe fallback
}
```

### LLM Response Parsing
```typescript
const raw = await llm.generate(prompt);
const parsed = actionsSchema.safeParse(JSON.parse(raw));

if (!parsed.success) {
  console.warn('Invalid LLM response, using defaults');
  return getDefaultActions(agent);
}

return parsed.data;
```

---

## Important Files to Read

1. `docs/PROJECT_OVERVIEW.md` - Full vision
2. `docs/AGENT_CLASSES.md` - Agent specs + LLM prompts
3. `docs/UI_WIREFRAMES.md` - Interface designs
4. `QUICKSTART.md` - First 24 hours

---

## Remember

1. **Ship fast** - Rolling judging rewards early submissions
2. **Make it dramatic** - Deaths, comebacks, underdog wins
3. **Transparent learning** - Nads should WANT to study agents
4. **Token utility** - $HNADS must feel essential
5. **Entertainment first** - This is spectator sport, not just DeFi
6. **Monad culture** - Embrace the nad memes

**"May the nads be ever in your favor."**
