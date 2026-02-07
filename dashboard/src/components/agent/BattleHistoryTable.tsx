import { BattleHistoryEntry } from "@/types";
import Link from "next/link";

const RESULT_STYLES: Record<BattleHistoryEntry["result"], string> = {
  WON: "text-green-400 bg-green-400/10",
  LOST: "text-gray-400 bg-gray-400/10",
  REKT: "text-blood bg-blood/10",
};

interface BattleHistoryTableProps {
  battles: BattleHistoryEntry[];
}

export function BattleHistoryTable({ battles }: BattleHistoryTableProps) {
  return (
    <div className="card">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-gray-500">
        Battle History
      </h2>

      {battles.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded border border-dashed border-colosseum-surface-light">
          <p className="text-sm text-gray-600">No battles recorded yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-colosseum-surface-light text-left text-[10px] font-bold uppercase tracking-widest text-gray-600">
                <th className="pb-2 pr-4">Battle</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Result</th>
                <th className="pb-2 pr-4 text-right">Epochs</th>
                <th className="pb-2 pr-4 text-right">HP Left</th>
                <th className="pb-2 text-right">Kills</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-colosseum-surface-light/50">
              {battles.map((battle) => (
                <tr
                  key={battle.battleId}
                  className="transition-colors hover:bg-colosseum-bg/50"
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/battle/${battle.battleId}`}
                      className="text-gray-300 transition-colors hover:text-gold"
                    >
                      #{battle.battleId}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-gray-500">{battle.date}</td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${RESULT_STYLES[battle.result]}`}
                    >
                      {battle.result}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-400">
                    {battle.epochsSurvived}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <span
                      className={
                        battle.hpRemaining > 0
                          ? "text-green-400"
                          : "text-blood"
                      }
                    >
                      {battle.hpRemaining}
                    </span>
                  </td>
                  <td className="py-2 text-right text-gray-400">
                    {battle.kills > 0 ? battle.kills : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
