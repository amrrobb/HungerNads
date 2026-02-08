interface HeroSectionProps {
  activeBattleCount: number;
}

export default function HeroSection({ activeBattleCount }: HeroSectionProps) {
  return (
    <section className="relative flex flex-col items-center py-16 text-center">
      {/* Glow effect behind title */}
      <div className="absolute top-8 h-32 w-96 rounded-full bg-gold/20 blur-3xl" />

      <h1 className="font-cinzel relative mb-3 text-5xl font-black uppercase tracking-widest text-gold drop-shadow-[0_0_30px_rgba(245,158,11,0.5)] sm:text-6xl">
        The Colosseum Awaits
      </h1>
      <p className="mb-6 text-lg text-gray-500">
        May the nads be ever in your favor.
      </p>

      {/* Active battle count pill */}
      <div className="flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-4 py-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
        </span>
        <span className="text-sm font-bold uppercase tracking-wider text-green-400">
          {activeBattleCount} {activeBattleCount === 1 ? "Battle" : "Battles"} Live
        </span>
      </div>
    </section>
  );
}
