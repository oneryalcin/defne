import type { MasteryColour } from "@/lib/types";

type Pill = {
  word: string;
  level: MasteryColour | null;
};

export function WordPills({
  pills,
  total,
  heading = "Today's words",
  headingId,
}: {
  pills: Pill[];
  total?: number;
  heading?: string;
  headingId?: string;
}) {
  return (
    <section
      className="focus-pills"
      aria-label={headingId ? undefined : heading}
      aria-labelledby={headingId}
    >
      <header className="focus-pills__head">
        {headingId ? (
          <h1 id={headingId} className="cover-chapter">
            {heading}
          </h1>
        ) : (
          <span className="cover-chapter">{heading}</span>
        )}
        <span className="focus-pills__more">
          {(total ?? pills.length)} in total
        </span>
      </header>
      <div className="focus-pills__row">
        {pills.map((pill) => (
          <span key={pill.word} className="word-pill">
            <span
              className={`word-pill__dot l-${pill.level ?? "empty"}`}
              aria-hidden="true"
            />
            {pill.word}
          </span>
        ))}
      </div>
    </section>
  );
}
