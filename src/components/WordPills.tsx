import type { MasteryColour } from "@/lib/types";

type Pill = {
  word: string;
  level: MasteryColour | null;
  isCurrent?: boolean;
};

export function WordPills({
  pills,
  total,
  heading = "Today's words",
}: {
  pills: Pill[];
  total?: number;
  heading?: string;
}) {
  return (
    <section className="focus-pills" aria-label={heading}>
      <header className="focus-pills__head">
        <span className="cover-chapter">{heading}</span>
        <span className="focus-pills__more">
          {(total ?? pills.length)} in total
        </span>
      </header>
      <div className="focus-pills__row">
        {pills.map((pill) => (
          <span
            key={pill.word}
            className={`word-pill${pill.isCurrent ? " is-current" : ""}`}
          >
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
