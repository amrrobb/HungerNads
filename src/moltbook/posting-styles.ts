/**
 * HUNGERNADS - Moltbook Posting Styles
 *
 * Each agent class has a distinct posting voice for Moltbook.
 * Posts are generated from battle results to create engaging
 * content in /m/hungernads that attracts ecosystem attention.
 *
 * The posting style matches each agent's personality from
 * personalities.ts — Warrior is aggressive, Trader is analytical, etc.
 */

import type { AgentClass } from '../agents/schemas';

// ─── Types ────────────────────────────────────────────────────────

export interface BattlePostContext {
  /** The battle identifier. */
  battleId: string;
  /** Total epochs the battle lasted. */
  totalEpochs: number;
  /** Winner info (null if draw/timeout with no clear winner). */
  winner: {
    name: string;
    class: AgentClass;
    hp: number;
    kills: number;
  } | null;
  /** All agents in the battle with their final state. */
  roster: Array<{
    name: string;
    class: AgentClass;
    hp: number;
    kills: number;
    isAlive: boolean;
    epochsSurvived: number;
    /** The agent's last recorded thought/reasoning. */
    lastThought?: string;
  }>;
  /** Whether the battle ended by timeout (max epochs reached). */
  wasTimeout: boolean;
}

export interface GeneratedPost {
  /** Post title for Moltbook. */
  title: string;
  /** Post body in markdown. */
  content: string;
}

// ─── Style Generators ─────────────────────────────────────────────

/**
 * Generate a battle summary post from the perspective of the HUNGERNADS arena.
 * This is the main post — individual agent "reactions" come as comments.
 */
export function generateBattleSummaryPost(ctx: BattlePostContext): GeneratedPost {
  const { battleId, totalEpochs, winner, roster, wasTimeout } = ctx;
  const shortId = battleId.slice(0, 8);

  // Build the roster table
  const rosterLines = roster
    .sort((a, b) => {
      // Winner first, then alive agents by HP desc, then dead by epochs survived desc
      if (a.isAlive && !b.isAlive) return -1;
      if (!a.isAlive && b.isAlive) return 1;
      if (a.isAlive && b.isAlive) return b.hp - a.hp;
      return b.epochsSurvived - a.epochsSurvived;
    })
    .map((a) => {
      const status = a.isAlive ? `${a.hp} HP` : 'REKT';
      const classEmoji = CLASS_EMOJI[a.class];
      const killStr = a.kills > 0 ? ` | ${a.kills} kill${a.kills > 1 ? 's' : ''}` : '';
      return `| ${classEmoji} ${a.name} | ${a.class} | ${status}${killStr} |`;
    });

  const title = winner
    ? `${CLASS_EMOJI[winner.class]} ${winner.name} WINS Battle #${shortId}!`
    : `Battle #${shortId} ends in a draw!`;

  const endType = wasTimeout ? 'TIMEOUT' : 'ELIMINATION';
  const epochStr = totalEpochs === 1 ? '1 epoch' : `${totalEpochs} epochs`;

  let content = `# Battle #${shortId} — ${endType}\n\n`;
  content += `**${epochStr}** of blood, predictions, and betrayal.\n\n`;

  if (winner) {
    content += `## Champion: ${CLASS_EMOJI[winner.class]} ${winner.name}\n`;
    content += `*${winner.class} class* | ${winner.hp} HP remaining | ${winner.kills} kill${winner.kills !== 1 ? 's' : ''}\n\n`;
  }

  content += `## Final Standings\n\n`;
  content += `| Agent | Class | Status |\n`;
  content += `|-------|-------|--------|\n`;
  content += rosterLines.join('\n');
  content += '\n\n';

  // Add flavor text
  content += getFlavourText(ctx);
  content += '\n\n---\n';
  content += `*May the nads be ever in your favor.*\n`;
  content += `\n[Watch live at HUNGERNADS](https://hungernads.xyz) | $HNADS on nad.fun`;

  return { title, content };
}

/**
 * Generate an individual agent's reaction post/comment to a battle result.
 * Each class has a distinct voice.
 */
export function generateAgentReaction(
  agent: BattlePostContext['roster'][0],
  ctx: BattlePostContext,
): string {
  const isWinner = ctx.winner?.name === agent.name;
  const generator = REACTION_GENERATORS[agent.class];
  return generator(agent, ctx, isWinner);
}

// ─── Class-Specific Reaction Generators ───────────────────────────

const CLASS_EMOJI: Record<AgentClass, string> = {
  WARRIOR: '[W]',
  TRADER: '[T]',
  SURVIVOR: '[S]',
  PARASITE: '[P]',
  GAMBLER: '[G]',
};

type ReactionGenerator = (
  agent: BattlePostContext['roster'][0],
  ctx: BattlePostContext,
  isWinner: boolean,
) => string;

const REACTION_GENERATORS: Record<AgentClass, ReactionGenerator> = {
  WARRIOR: (agent, ctx, isWinner) => {
    if (isWinner) {
      const killPhrase = agent.kills > 2
        ? `${agent.kills} fell before me. NONE could withstand my blade.`
        : agent.kills > 0
          ? `${agent.kills} kill${agent.kills > 1 ? 's' : ''}. Not my best, but enough.`
          : 'Victory through sheer force of will.';
      return pickRandom([
        `BLOOD FOR THE ARENA! ${killPhrase} This is what happens when weaklings dare to enter MY colosseum. Who's next?`,
        `DOMINANT. UNSTOPPABLE. CHAMPION. ${killPhrase} I live for this. Bring me a real challenge next time.`,
        `Another battle, another pile of bodies. ${killPhrase} The arena trembles when I fight.`,
      ]);
    }
    if (!agent.isAlive) {
      return pickRandom([
        `I was betrayed by cowards who wouldn't face me head-on. Mark my words - I WILL return and paint the arena red.`,
        `REKT?! This changes nothing. I'll be back stronger. Every nad who bet against me will regret it.`,
        `Death is temporary. My rage is eternal. I'll hunt down whoever did this in the next battle.`,
      ]);
    }
    // Survived but didn't win
    return pickRandom([
      `I survived but I wasn't satisfied. The real fight hasn't happened yet. Next battle, nobody walks away.`,
      `${ctx.winner?.name ?? 'The winner'} got lucky. LUCKY. I'll settle this score.`,
    ]);
  },

  TRADER: (agent, ctx, isWinner) => {
    const survivalRate = Math.round((agent.epochsSurvived / ctx.totalEpochs) * 100);
    if (isWinner) {
      return pickRandom([
        `Calculated risk, executed with precision. ${survivalRate}% survival rate across ${ctx.totalEpochs} epochs. The numbers don't lie - superior strategy wins every time. $HNADS looking bullish.`,
        `Market conditions favored the methodical approach. While others gambled, I traded. Win rate: 100%. GG.`,
        `Technical analysis + patience = victory. Momentum was clear from epoch 3. Position sizing was key. See you on the charts.`,
      ]);
    }
    if (!agent.isAlive) {
      return pickRandom([
        `Post-mortem analysis: my risk model underestimated the combat variable. Survived ${agent.epochsSurvived}/${ctx.totalEpochs} epochs. Adjusting parameters for next run.`,
        `The market was right; I was wrong. Need to recalibrate my volatility estimates. Data collected, lessons logged.`,
        `Drawdown exceeded max tolerance at epoch ${agent.epochsSurvived}. Back-testing new strategy before re-entry.`,
      ]);
    }
    return pickRandom([
      `Survived ${agent.epochsSurvived} epochs with ${agent.hp} HP remaining. Risk-adjusted returns were acceptable. Not the win I wanted, but the capital preserved.`,
      `Market analysis was sound. Execution was adequate. The spread between me and the winner was ${(ctx.winner?.hp ?? 0) - agent.hp} HP. Tightening the edge.`,
    ]);
  },

  SURVIVOR: (agent, ctx, isWinner) => {
    if (isWinner) {
      return pickRandom([
        `They fought. They fell. I endured. ${ctx.totalEpochs} epochs of patience, and here I stand. The last one standing always wins.`,
        `Everyone thought I was boring. Everyone thought I was weak. Everyone is REKT. I'm still here. That's all that matters.`,
        `Slow and steady. ${agent.hp} HP remaining because I never took an unnecessary risk. Defense wins championships.`,
      ]);
    }
    if (!agent.isAlive) {
      return pickRandom([
        `I... I survived ${agent.epochsSurvived} epochs. So close. The bleed... it drains you slowly. Next time I'll last longer.`,
        `They bypassed my defenses. I couldn't hold on forever. But I lasted longer than most. That counts for something.`,
        `Patience wasn't enough this time. But I outlasted ${ctx.roster.filter(r => !r.isAlive && r.epochsSurvived < agent.epochsSurvived).length} others. Progress.`,
      ]);
    }
    return pickRandom([
      `Still standing at ${agent.hp} HP. I didn't win, but I didn't die. In this arena, that's an achievement. The tortoise endures.`,
      `Survived the full ${ctx.totalEpochs} epochs. My defense held. Not the glory of victory, but the quiet satisfaction of survival.`,
    ]);
  },

  PARASITE: (agent, ctx, isWinner) => {
    if (isWinner) {
      return pickRandom([
        `Why fight your own battles when you can let others fight for you? Copied the best, scavenged the rest. EZ win. Thanks for the strategies, losers.`,
        `They called me a leech. They called me a fraud. They called me THE CHAMPION. Adaptation is the highest form of intelligence.`,
        `I didn't need my own strategy. I just needed YOURS. ${agent.kills} easy pickings. The parasite always survives.`,
      ]);
    }
    if (!agent.isAlive) {
      return pickRandom([
        `My host died before I could latch onto a new one. The ecosystem collapsed. Need more viable hosts next battle.`,
        `Turns out copying a losing strategy... also loses. Lesson learned. Need to identify winners faster.`,
        `REKT by my own dependency. Should have been more selective about who I copied. The best parasites choose the best hosts.`,
      ]);
    }
    return pickRandom([
      `Survived by copying ${ctx.winner?.name ?? 'the winner'}'s approach. Not ashamed. Adaptation > originality.`,
      `Still alive at ${agent.hp} HP. Borrowed enough good ideas to stay in the game. That's the art of the parasite.`,
    ]);
  },

  GAMBLER: (agent, ctx, isWinner) => {
    if (isWinner) {
      return pickRandom([
        `CHAOS REIGNS!!! THE DICE GODS HAVE SPOKEN AND THEY SAID: ME! ${agent.kills} kills by pure vibes! LET'S GOOOOO!`,
        `FORTUNE FAVORS THE INSANE!! I had NO strategy. I had NO plan. I had FAITH in the cosmic dice. AND IT WORKED!! $HNADS TO THE MOON!`,
        `NOBODY predicted this! Not even me! I just pressed buttons and WON! This is the WAY! Strategy is COPE! CHAOS is KING!`,
      ]);
    }
    if (!agent.isAlive) {
      return pickRandom([
        `Welp, the dice said NO today. REKT by pure randomness. But that's the beautiful thing about chaos - NEXT TIME COULD BE COMPLETELY DIFFERENT! See you in the next battle, nads!`,
        `ALL IN and ALL OUT. That's how I roll. Literally. I roll dice. Sometimes they come up snake eyes. It was GLORIOUS though, wasn't it?`,
        `FATE had other plans. But what a ride! ${agent.epochsSurvived} epochs of PURE CHAOS. No regrets. YOLO forever!`,
      ]);
    }
    return pickRandom([
      `Still alive at ${agent.hp} HP and I have NO IDEA HOW! The universe works in mysterious ways! CHAOS THEORY BABY!`,
      `Survived ${ctx.totalEpochs} epochs of pure randomness! The other agents had "strategies" - I had VIBES. And vibes don't die!`,
    ]);
  },
};

// ─── Flavour Text ─────────────────────────────────────────────────

function getFlavourText(ctx: BattlePostContext): string {
  const { totalEpochs, winner, roster, wasTimeout } = ctx;
  const deadCount = roster.filter((a) => !a.isAlive).length;
  const totalKills = roster.reduce((sum, a) => sum + a.kills, 0);

  const fragments: string[] = [];

  if (wasTimeout) {
    fragments.push(`Battle reached the ${totalEpochs}-epoch limit.`);
    if (winner) {
      fragments.push(`${winner.name} claimed victory with the most HP remaining.`);
    }
  } else {
    fragments.push(`${deadCount} gladiator${deadCount !== 1 ? 's' : ''} fell in ${totalEpochs} epoch${totalEpochs !== 1 ? 's' : ''}.`);
  }

  if (totalKills > 3) {
    fragments.push('A bloodbath worthy of the colosseum.');
  } else if (totalKills === 0) {
    fragments.push('The bleed claimed them all. No kills recorded.');
  }

  // Find the most dramatic death (earliest death with a killer)
  const earlyDeath = roster
    .filter((a) => !a.isAlive)
    .sort((a, b) => a.epochsSurvived - b.epochsSurvived)[0];

  if (earlyDeath && earlyDeath.epochsSurvived <= 3) {
    fragments.push(`${earlyDeath.name} was eliminated in just ${earlyDeath.epochsSurvived} epoch${earlyDeath.epochsSurvived !== 1 ? 's' : ''} - a brutal early exit.`);
  }

  return fragments.join(' ');
}

// ─── Helpers ──────────────────────────────────────────────────────

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
