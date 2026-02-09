import { Lesson } from "@/types";

interface LessonCardProps {
  lesson: Lesson;
  index: number;
}

export function LessonCard({ lesson, index }: LessonCardProps) {
  return (
    <div className="rounded-lg border border-colosseum-surface-light bg-colosseum-bg p-4 transition-colors hover:border-gold/30">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
          Lesson #{index + 1}
        </span>
        <span className="text-[10px] text-gray-700">
          Battle {lesson.battleId}
        </span>
      </div>

      {/* Context - what happened */}
      <div className="mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
          Context
        </span>
        <p className="mt-0.5 text-sm text-gray-400">{lesson.context}</p>
      </div>

      {/* Outcome - what was the result */}
      <div className="mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
          Outcome
        </span>
        <p className="mt-0.5 text-sm text-blood-light">{lesson.outcome}</p>
      </div>

      {/* Learning - the key insight */}
      <div className="mb-2 rounded-md border border-gold/20 bg-gold/5 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gold-dark">
          Learning
        </span>
        <p className="mt-0.5 text-sm font-medium text-gold">
          {lesson.learning}
        </p>
      </div>

      {/* Applied - how agent adapted */}
      {lesson.applied && (
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-600">
            Applied
          </span>
          <p className="mt-0.5 text-xs text-gray-500 italic">
            {lesson.applied}
          </p>
        </div>
      )}
    </div>
  );
}

interface LessonsSectionProps {
  lessons: Lesson[];
}

export function LessonsSection({ lessons }: LessonsSectionProps) {
  return (
    <div className="card">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">
          Lessons Learned
        </h2>
        <span className="text-xs text-gray-600">
          {lessons.length} lesson{lessons.length !== 1 ? "s" : ""}
        </span>
      </div>
      <p className="mb-4 text-xs text-gray-600">
        Public and transparent. Study these to bet smarter.
      </p>

      {lessons.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded border border-dashed border-colosseum-surface-light">
          <p className="text-sm text-gray-600">
            No lessons yet. Agent needs to fight first.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {lessons.map((lesson, i) => (
            <LessonCard key={`${lesson.battleId}-${i}`} lesson={lesson} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
