// Compact horizontal strip of attempts as colored dots — quick read for
// "is this word getting more correct over time?"

export function AttemptStrip({
  attempts,
}: {
  attempts: Array<{
    id: string;
    answeredAt: string;
    isCorrect: boolean;
    hintLevelUsed: number;
  }>;
}) {
  if (attempts.length === 0) return null;
  const sorted = [...attempts].sort(
    (a, b) =>
      new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime()
  );
  const start = new Date(sorted[0].answeredAt).getTime();
  const end = new Date(sorted[sorted.length - 1].answeredAt).getTime();
  const span = Math.max(1, end - start);
  return (
    <div className="attempt-strip" aria-label="Attempt timeline strip">
      <div className="attempt-strip__rail">
        {sorted.map((attempt) => {
          const t = new Date(attempt.answeredAt).getTime();
          const left = ((t - start) / span) * 100;
          return (
            <span
              key={attempt.id}
              className={`attempt-strip__dot attempt-strip__dot--${attempt.isCorrect ? "ok" : "miss"}`}
              style={{
                left: `${left}%`,
                width: `${10 + attempt.hintLevelUsed * 2}px`,
                height: `${10 + attempt.hintLevelUsed * 2}px`,
              }}
              title={`${new Date(attempt.answeredAt).toLocaleString()} — ${attempt.isCorrect ? "correct" : "wrong"}${attempt.hintLevelUsed > 0 ? `, hint ${attempt.hintLevelUsed}` : ""}`}
            />
          );
        })}
      </div>
      <div className="attempt-strip__axis">
        <span>{new Date(start).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        <span>{new Date(end).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
      </div>
    </div>
  );
}
