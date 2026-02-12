/**
 * Multi-Provider LLM Client for HUNGERNADS
 * 
 * Combines free tiers from multiple providers:
 * - Groq: 1,000 req/day, 100K tokens/day
 * - OpenRouter: 50 req/day (free models)
 * - Google Gemini: ~1,500 req/day
 * 
 * Total: ~2,500+ requests/day for FREE
 */

import OpenAI from 'openai';

interface Provider {
  name: string;
  client: OpenAI;
  model: string;
  priority: number;
  requestsToday: number;
  lastReset: Date;
  dailyLimit: number;
}

interface LLMResponse {
  content: string;
  provider: string;
  model: string;
}

/**
 * Explicit API keys for environments without process.env (e.g. Cloudflare Workers).
 * When provided, these take precedence over process.env lookups.
 */
export interface LLMKeys {
  groqApiKey?: string;
  groq2ApiKey?: string;
  googleApiKey?: string;
  openrouterApiKey?: string;
}

export class MultiProviderLLM {
  private providers: Provider[] = [];
  private currentIndex = 0;

  constructor(keys?: LLMKeys) {
    // Resolve keys: explicit keys take precedence, fall back to process.env
    const env = typeof process !== 'undefined' ? process.env : {};
    const groqKey = keys?.groqApiKey ?? env.GROQ_API_KEY;
    const groq2Key = keys?.groq2ApiKey ?? env.GROQ_2_API_KEY;
    const googleKey = keys?.googleApiKey ?? env.GOOGLE_API_KEY;
    const openrouterKey = keys?.openrouterApiKey ?? env.OPENROUTER_API_KEY;

    // Initialize providers in priority order (best free tiers first)

    // 1. Groq - Best free tier (1,000 req/day)
    if (groqKey) {
      this.providers.push({
        name: 'groq',
        client: new OpenAI({
          apiKey: groqKey,
          baseURL: 'https://api.groq.com/openai/v1',
        }),
        model: 'llama-3.3-70b-versatile',
        priority: 1,
        requestsToday: 0,
        lastReset: new Date(),
        dailyLimit: 1000,
      });
    }

    // 1b. Groq secondary key - Another 1,000 req/day
    if (groq2Key) {
      this.providers.push({
        name: 'groq-2',
        client: new OpenAI({
          apiKey: groq2Key,
          baseURL: 'https://api.groq.com/openai/v1',
        }),
        model: 'llama-3.3-70b-versatile',
        priority: 1,
        requestsToday: 0,
        lastReset: new Date(),
        dailyLimit: 1000,
      });
    }

    // 2. Google Gemini - Good free tier (~1,500 req/day)
    if (googleKey) {
      this.providers.push({
        name: 'google',
        client: new OpenAI({
          apiKey: googleKey,
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        }),
        model: 'gemini-2.0-flash',
        priority: 2,
        requestsToday: 0,
        lastReset: new Date(),
        dailyLimit: 1500,
      });
    }

    // 3. OpenRouter - Smaller free tier (50 req/day) but good fallback
    if (openrouterKey) {
      this.providers.push({
        name: 'openrouter',
        client: new OpenAI({
          apiKey: openrouterKey,
          baseURL: 'https://openrouter.ai/api/v1',
        }),
        model: 'meta-llama/llama-3.3-70b-instruct:free',
        priority: 3,
        requestsToday: 0,
        lastReset: new Date(),
        dailyLimit: 50,
      });
    }

    if (this.providers.length === 0) {
      throw new Error(
        'No LLM providers configured! Set at least one of: GROQ_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY'
      );
    }

    console.log(`[LLM] Initialized ${this.providers.length} providers:`,
      this.providers.map(p => `${p.name} (${p.dailyLimit}/day)`).join(', ')
    );
  }

  /**
   * Reset daily counters if new day
   */
  private checkDailyReset(provider: Provider): void {
    const now = new Date();
    if (now.toDateString() !== provider.lastReset.toDateString()) {
      provider.requestsToday = 0;
      provider.lastReset = now;
      console.log(`[LLM] Reset daily counter for ${provider.name}`);
    }
  }

  /**
   * Get next available provider (round-robin with rate limit awareness)
   */
  private getNextProvider(): Provider | null {
    const startIndex = this.currentIndex;
    
    do {
      const provider = this.providers[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.providers.length;
      
      this.checkDailyReset(provider);
      
      // Check if provider has capacity
      if (provider.requestsToday < provider.dailyLimit) {
        return provider;
      }
      
      console.log(`[LLM] ${provider.name} at daily limit (${provider.requestsToday}/${provider.dailyLimit})`);
    } while (this.currentIndex !== startIndex);
    
    return null; // All providers exhausted
  }

  /**
   * Call LLM with automatic fallback
   */
  async chat(
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<LLMResponse> {
    const maxRetries = this.providers.length;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const provider = this.getNextProvider();
      
      if (!provider) {
        throw new Error('All LLM providers exhausted their daily limits!');
      }

      try {
        console.log(`[LLM] Calling ${provider.name}/${provider.model}...`);
        
        const response = await provider.client.chat.completions.create({
          model: provider.model,
          messages,
          max_tokens: options?.maxTokens ?? 500,
          temperature: options?.temperature ?? 0.7,
        });

        provider.requestsToday++;
        
        const content = response.choices[0]?.message?.content || '';
        
        console.log(`[LLM] Success from ${provider.name} (${provider.requestsToday}/${provider.dailyLimit} today)`);
        
        return {
          content,
          provider: provider.name,
          model: provider.model,
        };
      } catch (error: any) {
        lastError = error;
        
        // Rate limited - try next provider
        if (error?.status === 429) {
          console.log(`[LLM] ${provider.name} rate limited, trying next...`);
          provider.requestsToday = provider.dailyLimit; // Mark as exhausted
          continue;
        }
        
        // Other error - log and try next
        console.error(`[LLM] ${provider.name} error:`, error.message);
        continue;
      }
    }

    throw lastError || new Error('All LLM providers failed');
  }

  /**
   * Get current status of all providers
   */
  getStatus(): { name: string; used: number; limit: number; available: number }[] {
    return this.providers.map(p => {
      this.checkDailyReset(p);
      return {
        name: p.name,
        used: p.requestsToday,
        limit: p.dailyLimit,
        available: p.dailyLimit - p.requestsToday,
      };
    });
  }

  /**
   * Get total remaining requests across all providers
   */
  getTotalRemaining(): number {
    return this.getStatus().reduce((sum, p) => sum + p.available, 0);
  }
}

// Singleton instance (keyed by serialised keys for multi-tenant safety)
let llmInstance: MultiProviderLLM | null = null;
let llmInstanceKeyHash: string = '';

function keyHash(keys?: LLMKeys): string {
  if (!keys) return '__env__';
  return [keys.groqApiKey, keys.groq2ApiKey, keys.googleApiKey, keys.openrouterApiKey]
    .map(k => k ? k.slice(0, 8) : '')
    .join('|');
}

export function getLLM(keys?: LLMKeys): MultiProviderLLM {
  const hash = keyHash(keys);
  if (!llmInstance || llmInstanceKeyHash !== hash) {
    llmInstance = new MultiProviderLLM(keys);
    llmInstanceKeyHash = hash;
  }
  return llmInstance;
}

// Agent decision result type (supports both new triangle and legacy fields)
export interface AgentDecisionResult {
  prediction: { asset: string; direction: 'UP' | 'DOWN'; stake: number };
  // New combat triangle fields
  combatStance?: 'ATTACK' | 'SABOTAGE' | 'DEFEND' | 'NONE';
  combatTarget?: string;
  combatStake?: number;
  // Hex grid movement (optional)
  move?: { q: number; r: number };
  // Skill system
  useSkill?: boolean;
  skillTarget?: string;
  // Legacy fields (for backward compat during migration)
  attack?: { target: string; stake: number } | null;
  defend?: boolean;
  reasoning: string;
}

// Example usage for agent decisions
export async function agentDecision(
  agentName: string,
  agentClass: string,
  personality: string,
  hp: number,
  marketData: { eth: number; btc: number; sol: number; mon: number },
  otherAgents: { name: string; class: string; hp: number }[],
  lessons: string[],
  keys?: LLMKeys,
  /** Spatial context string from grid.buildSpatialContext (optional). */
  spatialContext?: string,
): Promise<AgentDecisionResult> {
  const llm = getLLM(keys);

  const systemPrompt = `You are ${agentName}, a ${agentClass} agent in HUNGERNADS arena.
${personality}

Your lessons from past battles:
${lessons.length > 0 ? lessons.join('\n') : 'No lessons yet.'}

You must respond with ONLY valid JSON, no other text.`;

  const spatialBlock = spatialContext
    ? `\nARENA POSITION:\n${spatialContext}\n`
    : '';

  const userPrompt = `MARKET PRICES:
ETH: $${marketData.eth}
BTC: $${marketData.btc}
SOL: $${marketData.sol}
MON: $${marketData.mon}

YOUR STATUS:
HP: ${hp}/1000
${spatialBlock}
OTHER AGENTS:
${otherAgents.map(a => `- ${a.name} (${a.class}): ${a.hp} HP`).join('\n')}

ACTIONS REQUIRED:
1. PREDICT: Choose asset (ETH/BTC/SOL/MON), direction (UP/DOWN), stake (5-50% of HP)
2. COMBAT STANCE: Choose ATTACK, SABOTAGE, DEFEND, or NONE
   - ATTACK beats SABOTAGE (overpower: steal full stake)
   - SABOTAGE beats DEFEND (bypass: deal 60% stake damage through defense)
   - DEFEND beats ATTACK (absorb: reflect 50% damage, take only 25%)
   - ATTACK/SABOTAGE require combatTarget and combatStake
   - You can ONLY attack/sabotage ADJACENT agents (neighboring hexes)
3. MOVE: Move to an adjacent empty hex. You SHOULD move every turn. Format: {"q": <num>, "r": <num>}
   IMPORTANT: Always include a "move" field to reposition. Staying still in the storm = death.

Respond with JSON:
{
  "prediction": {"asset": "ETH", "direction": "UP", "stake": 20},
  "combatStance": "ATTACK",
  "combatTarget": "SURVIVOR-01",
  "combatStake": 50,
  "move": {"q": 1, "r": 0},
  "useSkill": false,
  "skillTarget": "AGENT-NAME",
  "reasoning": "Brief explanation"
}`;

  const response = await llm.chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ], { maxTokens: 400, temperature: 0.7 });

  try {
    // Clean response (remove markdown code blocks if present)
    let jsonStr = response.content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Normalize: if LLM returns legacy fields, convert to new format
    if (!parsed.combatStance && (parsed.attack || parsed.defend)) {
      if (parsed.attack) {
        parsed.combatStance = 'ATTACK';
        parsed.combatTarget = parsed.attack.target;
        parsed.combatStake = parsed.attack.stake;
      } else if (parsed.defend) {
        parsed.combatStance = 'DEFEND';
      } else {
        parsed.combatStance = 'NONE';
      }
    }

    return parsed;
  } catch (e) {
    console.error('[LLM] Failed to parse response:', response.content);
    // Return safe defaults
    return {
      prediction: { asset: 'ETH', direction: 'UP', stake: 10 },
      combatStance: 'NONE',
      reasoning: 'Failed to parse LLM response, using defaults',
    };
  }
}
