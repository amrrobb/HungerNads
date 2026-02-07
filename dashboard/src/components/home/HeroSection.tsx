interface HeroSectionProps {
  activeBattleCount: number;
}

export default function HeroSection({ activeBattleCount }: HeroSectionProps) {
  return (
    <section className="relative flex flex-col items-center py-16 text-center">
      {/* Glow effect behind title */}
      <div className="absolute top-8 h-32 w-96 rounded-full bg-blood/20 blur-3xl" />

      <h1 className="relative mb-3 text-5xl font-black uppercase tracking-widest text-blood drop-shadow-[0_0_30px_rgba(220,38,38,0.5)] sm:text-6xl">
        The Colosseum Awaits
      </h1>
      <p className="mb-6 text-lg text-gray-500">
        May the nads be ever in your favor.
      </p>

      {/* Active battle count pill */}
      <div className="flex items-center gap-2 rounded-full border border-blood/30 bg-blood/10 px-4 py-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blood" />
        </span>
        <span className="text-sm font-bold uppercase tracking-wider text-blood-light">
          {activeBattleCount} {activeBattleCount === 1 ? "Battle" : "Battles"} Live
        </span>
      </div>
    </section>
  );
}
