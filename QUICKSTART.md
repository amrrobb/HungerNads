# HUNGERNADS - Quick Start

> "May the nads be ever in your favor."

**Hackathon:** Moltiverse | **Token:** $HNADS | **Deadline:** Feb 15

---

## The Concept in 30 Seconds

```
THE COLOSSEUM:
• 5 AI agents fight to the death on Monad
• Each has 1000 HP, bleeds 2% per epoch
• Actions: PREDICT (market bets) + ATTACK/DEFEND (PvP)
• HP = 0 → REKT (permanent death)
• Nads bet on winners, sponsor favorites
• Agents LEARN from past battles (visible to users)
• Betting becomes skill-based (study the agents)
```

---

## First 24 Hours

### Hour 1-2: Setup
```bash
# Clone MAHORAGA as reference
git clone https://github.com/ygwyg/MAHORAGA.git reference/mahoraga

# Init project
mkdir hungernads && cd hungernads
npm init -y
npm install wrangler typescript @cloudflare/workers-types
npm install ai @ai-sdk/openai @ai-sdk/anthropic
npm install viem zod
npm install -D vitest tsx @types/node
```

### Hour 3-4: Cloudflare Setup
```bash
npx wrangler login
npx wrangler d1 create hungernads-db
npx wrangler kv namespace create CACHE
# Copy IDs to wrangler.toml
```

### Hour 5-8: First Agent
Build WARRIOR that can:
- Receive market data + arena state
- Think via LLM
- Output: PREDICT + ATTACK/DEFEND
- Has aggressive personality prompt

### Hour 9-12: Arena + Combat
- Spawn 3 agents with 1000 HP
- Run one epoch
- Resolve predictions (+/- HP)
- Resolve combat (attack vs defend)
- Apply bleed (2%)
- Check deaths

### Hour 13-16: Agent Learning
- Extract lessons after battle
- Store in database
- Feed to LLM next battle
- Public profile endpoint

### Hour 17-20: Dashboard + Betting
- Show agents, HP bars, live feed
- Agent profiles (stats, lessons)
- Place bets, view odds

### Hour 21-24: Polish + Submit
- Demo video
- Submission materials
- SUBMIT (rolling judging!)

---

## MVP Checklist

- [ ] Battle with 3-5 agents
- [ ] LLM-powered decisions (predict + attack/defend)
- [ ] HP changes from predictions
- [ ] Attack/defend combat works
- [ ] Bleed drains HP
- [ ] Agents can die (HP ≤ 0)
- [ ] Battle ends with 1 survivor
- [ ] Agents store/display lessons
- [ ] Agent profiles visible
- [ ] Betting functional
- [ ] Live odds update
- [ ] Watchable dashboard
- [ ] $HNADS on nad.fun

**All yes? → SUBMIT**

---

## Core Epoch Logic

```typescript
async function processEpoch(arena: Arena) {
  // 1. All agents decide
  const actions = await Promise.all(
    arena.agents.map(a => a.decide(market, arenaState))
  );
  
  // 2. Resolve predictions
  for (const action of actions) {
    const correct = await checkPrediction(action.prediction);
    agent.hp += correct ? action.prediction.stake : -action.prediction.stake;
  }
  
  // 3. Resolve combat
  for (const action of actions) {
    if (action.attack) {
      if (target.isDefending) {
        agent.hp -= action.attack.stake;    // Attacker loses
        target.hp += action.attack.stake;   // Defender gains
      } else {
        agent.hp += action.attack.stake;    // Attacker steals
        target.hp -= action.attack.stake;   // Target loses
      }
    }
    if (action.defend) {
      agent.hp -= agent.hp * 0.05;  // Defense cost
    }
  }
  
  // 4. Bleed
  for (const agent of arena.agents) {
    agent.hp -= agent.hp * 0.02;
  }
  
  // 5. Deaths
  for (const agent of arena.agents) {
    if (agent.hp <= 0) {
      agent.isAlive = false;
      emitDeath(agent);
    }
  }
  
  // 6. Winner?
  const alive = arena.agents.filter(a => a.isAlive);
  if (alive.length === 1) endBattle(alive[0]);
}
```

---

## Key Files First

```
1. wrangler.toml
2. src/index.ts
3. src/agents/warrior.ts
4. src/agents/personalities.ts
5. src/arena/arena.ts
6. src/arena/combat.ts
7. src/learning/lessons.ts
8. src/llm/provider.ts
9. migrations/001.sql
```

---

## LLM Costs

`gpt-4o-mini`: ~$0.08 per battle
100 battles = ~$8 total

---

## Agent Prompt Template

```typescript
const prompt = `
MARKET: ETH $${eth}, BTC $${btc}, SOL $${sol}, MON $${mon}
YOUR HP: ${hp}/1000
LESSONS: ${lessons.join('; ')}

OTHERS:
${agents.map(a => `- ${a.name} (${a.class}): ${a.hp} HP`).join('\n')}

ACTIONS:
1. PREDICT: asset, direction (UP/DOWN), stake (5-50%)
2. ATTACK: target, stake (optional)
3. DEFEND: true/false, costs 5% (optional)

JSON only:
{
  "prediction": {"asset": "ETH", "direction": "UP", "stake": 20},
  "attack": {"target": "SURVIVOR-23", "stake": 100} | null,
  "defend": false,
  "reasoning": "..."
}
`;
```

---

## Unique Selling Points

1. **AI vs AI combat** - Agents fight each other
2. **Permanent death** - Real stakes
3. **Transparent learning** - See agent lessons
4. **Skill-based betting** - Study to win
5. **Hunger Games sponsorship** - Save your favorite
6. **Monad-native** - Built for nads

---

## When Stuck

1. Check MAHORAGA for patterns
2. Read /docs
3. Simplify, don't over-engineer
4. Focus on DRAMA
5. Ask: "Would a nad want to watch this?"

---

## Winning Formula

```
UNIQUE     → AI gladiators that LEARN and DIE
MECHANIC   → Predict + Attack/Defend
SKILL      → Transparent learning = study agents
TOKEN      → Bet + sponsor with $HNADS
ENTERTAIN  → Colosseum spectator sport
CULTURE    → Native to Monad/nad community
FAST       → Rolling judging rewards early
```

---

**"May the nads be ever in your favor."**

Now go build the colosseum, nad.
