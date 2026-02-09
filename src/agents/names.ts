/**
 * HUNGERNADS - Agent Name System
 *
 * Thematic name pools per agent class. Names are assigned at spawn time
 * by picking a random unused name from the pool. All names are uppercase
 * for the colosseum aesthetic.
 *
 * Each pool has 12+ names to support multiple agents of the same class
 * across concurrent battles without frequent repeats.
 */

import type { AgentClass } from './schemas';

// ---------------------------------------------------------------------------
// Name Pools
// ---------------------------------------------------------------------------

export const AGENT_NAME_POOLS: Readonly<Record<AgentClass, readonly string[]>> = {
  WARRIOR: [
    'BLOODFANG',
    'WARBRINGER',
    'IRONJAW',
    'SKULLCRUSHER',
    'RAZORFIST',
    'DOOMHAMMER',
    'GOREFIST',
    'WRATHBORN',
    'HELLBLADE',
    'BONEBREAKER',
    'DEATHGRIP',
    'SAVAGECLAW',
  ],
  TRADER: [
    'ALPHABOT',
    'CHARTLORD',
    'FIBONACCI',
    'BULLWHALE',
    'BEARKING',
    'QUANTMIND',
    'BOLLINGR',
    'ICHIMOKU',
    'TRENDLINE',
    'SHORTSELL',
    'CANDLWICK',
    'STOCHASTC',
  ],
  SURVIVOR: [
    'IRONSHELL',
    'BUNKERBOY',
    'COCKROACH',
    'LASTSTAND',
    'GHOSTWALK',
    'WALLFLWR',
    'ENDURANCE',
    'TORTOISE',
    'HIDEAWAY',
    'DEADPLAY',
    'OUTLASTER',
    'STUBNBORN',
  ],
  PARASITE: [
    'LEECHKING',
    'COPYCAT',
    'SHADOWSTEP',
    'MIMIC',
    'REMORA',
    'SYMBIOTE',
    'HIVEMIND',
    'SKINSHED',
    'LAMPREY',
    'BODYSNTCH',
    'TWINFLAME',
    'DOPPELGNG',
  ],
  GAMBLER: [
    'MADLAD',
    'YOLO',
    'DEGEN',
    'FLIPCOIN',
    'MOONSHOT',
    'RUGPULL',
    'JACKPOT',
    'CHAOSKING',
    'ROULETTE',
    'ALLINSIR',
    'DICEGOD',
    'APEMAXI',
  ],
} as const;

// ---------------------------------------------------------------------------
// Name Picker
// ---------------------------------------------------------------------------

/**
 * Pick a random name for the given class, avoiding names in the `used` set.
 * If all names in the pool are used, falls back to a pool name with a numeric
 * suffix (e.g. BLOODFANG-2) to guarantee uniqueness.
 */
export function pickAgentName(
  agentClass: AgentClass,
  used: ReadonlySet<string> = new Set(),
): string {
  const pool = AGENT_NAME_POOLS[agentClass];

  // Collect available (unused) names
  const available = pool.filter(name => !used.has(name));

  if (available.length > 0) {
    // Random selection from available names
    return available[Math.floor(Math.random() * available.length)];
  }

  // All names used -- append a numeric suffix to a random pool name
  const baseName = pool[Math.floor(Math.random() * pool.length)];
  let suffix = 2;
  while (used.has(`${baseName}-${suffix}`)) {
    suffix++;
  }
  return `${baseName}-${suffix}`;
}

/**
 * Pick names for a full roster of agent classes.
 * Returns an array of names in the same order as the input classes.
 * Guarantees no duplicates within the batch.
 */
export function pickRosterNames(classes: AgentClass[]): string[] {
  const used = new Set<string>();
  const names: string[] = [];

  for (const agentClass of classes) {
    const name = pickAgentName(agentClass, used);
    used.add(name);
    names.push(name);
  }

  return names;
}
