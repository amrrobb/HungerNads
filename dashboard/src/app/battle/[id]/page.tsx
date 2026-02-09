import BattleView from "./BattleView";

interface BattlePageProps {
  params: Promise<{ id: string }>;
}

export default async function BattlePage({ params }: BattlePageProps) {
  const { id } = await params;

  return <BattleView battleId={id} />;
}
