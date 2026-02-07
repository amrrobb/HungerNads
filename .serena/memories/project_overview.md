# HUNGERNADS - Project Overview

AI gladiator colosseum on Monad blockchain. Agents fight to survive, users bet and sponsor.

## Tech Stack
- **Runtime:** Cloudflare Workers + Durable Objects
- **Language:** TypeScript (strict mode, ES2022)
- **Framework:** Hono (web framework on CF Workers)
- **LLM:** Multi-provider (Groq, Google Gemini, OpenRouter) via Vercel AI SDK
- **Database:** Cloudflare D1 (SQLite)
- **Blockchain:** Monad testnet (via viem)
- **Validation:** Zod schemas
- **Price feeds:** Pyth Network (Hermes API)

## Key Architecture
- `src/agents/` - Agent classes (Warrior, Trader, Survivor, Parasite, Gambler) extending BaseAgent
- `src/arena/` - Battle engine (ArenaManager, epoch processor, combat, prediction, death, price feeds)
- `src/betting/` - Betting pool, odds, sponsorship
- `src/api/` - Hono API routes + WebSocket
- `src/durable-objects/` - CF Durable Objects for persistent state
- `src/llm/` - Multi-provider LLM integration
- `src/db/` - D1 schema + migrations

## Code Style
- TypeScript strict mode
- JSDoc-style comment blocks at file top
- Section separators with `// ─── Section Name ───` or `// -------...`
- Pure functions preferred (return results, caller applies state changes)
- Zod for runtime validation of LLM outputs
- Types defined in schemas.ts, re-exported via index.ts barrel files
