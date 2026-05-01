// Show the top of the priority queue with this word highlighted.
// Anchors the abstract "rank 12 of 53" into something a parent can see.

import Link from "next/link";

export function CompetitorList({
  competitors,
}: {
  competitors: Array<{
    wordId: string;
    word: string;
    score: number;
    isThis: boolean;
    inNextRound: boolean;
  }>;
}) {
  const max = Math.max(...competitors.map((c) => c.score), 0.001);
  return (
    <ol className="competitor-list">
      {competitors.map((row, idx) => {
        const widthPct = Math.max(2, (row.score / max) * 100);
        const rank = idx + 1;
        return (
          <li
            key={row.wordId}
            className={`competitor-row${row.isThis ? " competitor-row--this" : ""}`}
          >
            <span className="competitor-row__rank">{rank}</span>
            <span className="competitor-row__word">
              {row.isThis ? (
                <strong>{row.word}</strong>
              ) : (
                <Link href={`/parent/words/${row.wordId}`}>{row.word}</Link>
              )}
              {row.inNextRound ? (
                <span className="competitor-row__pill">In next round</span>
              ) : null}
            </span>
            <span className="competitor-row__bar">
              <span
                className="competitor-row__fill"
                style={{ width: `${widthPct}%` }}
              />
            </span>
            <span className="competitor-row__score">{row.score.toFixed(2)}</span>
          </li>
        );
      })}
    </ol>
  );
}
