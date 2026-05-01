import Link from "next/link";
import type { ParentWordListItem } from "@/lib/db/repository";
import type { MasteryColour } from "@/lib/types";

const COLOUR_FILL: Record<MasteryColour, string> = {
  red: "var(--mastery-red)",
  orange: "var(--mastery-orange)",
  yellow: "var(--mastery-yellow)",
  light_green: "var(--mastery-light)",
  green: "var(--mastery-green)",
};

const COLOUR_LABEL: Record<MasteryColour, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered",
};

const SORT_RANK: Record<MasteryColour | "untracked", number> = {
  red: 0,
  orange: 1,
  yellow: 2,
  light_green: 3,
  green: 4,
  untracked: 5,
};

export type HeatmapVariant = "parent" | "child";

export function WordHeatmap({
  words,
  page,
  pageSize,
  variant = "parent",
  basePath,
  pageParam = "p",
}: {
  words: ParentWordListItem[];
  page: number;
  pageSize: number;
  variant?: HeatmapVariant;
  basePath: string;
  pageParam?: string;
}) {
  const sorted = [...words].sort((a, b) => {
    const aKey: MasteryColour | "untracked" = a.masteryColour ?? "untracked";
    const bKey: MasteryColour | "untracked" = b.masteryColour ?? "untracked";
    if (SORT_RANK[aKey] !== SORT_RANK[bKey]) return SORT_RANK[aKey] - SORT_RANK[bKey];
    return a.word.localeCompare(b.word);
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = sorted.slice(start, start + pageSize);

  return (
    <div className="heatmap" aria-label="Word mastery heatmap">
      <div className="heatmap__legend" aria-hidden="true">
        <span>
          <span className="heatmap__dot" style={{ background: "rgba(31,41,55,0.18)" }} />
          Not started
        </span>
        {(["red", "orange", "yellow", "light_green", "green"] as MasteryColour[]).map(
          (colour) => (
            <span key={colour}>
              <span
                className="heatmap__dot"
                style={{ background: COLOUR_FILL[colour] }}
              />
              {COLOUR_LABEL[colour]}
            </span>
          )
        )}
      </div>

      <div className="heatmap__grid" role="list">
        {slice.map((word) => {
          const fill = word.masteryColour
            ? COLOUR_FILL[word.masteryColour]
            : "rgba(31,41,55,0.14)";
          const label = word.masteryColour
            ? COLOUR_LABEL[word.masteryColour]
            : "Not started";
          const stats =
            word.attemptCount > 0
              ? `Seen ${word.attemptCount} · ✓ ${word.correctCount} · ✗ ${word.wrongCount}`
              : "Not started yet";
          return (
            <Link
              key={word.id}
              role="listitem"
              className="heatmap-cell"
              style={{ background: fill }}
              href={`/parent/words/${word.id}`}
              prefetch={false}
            >
              <span className="heatmap-cell__word">{word.word}</span>
              <span className="heatmap-cell__pop" role="tooltip">
                <strong>{word.word}</strong>
                <span className="heatmap-cell__state">{label}</span>
                <span className="heatmap-cell__stats">{stats}</span>
                {word.scoreReasons.length > 0 ? (
                  <ul className="heatmap-cell__why">
                    {word.scoreReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    color: "var(--forest-green)",
                    marginTop: 4,
                  }}
                >
                  Click for full history →
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <footer className="heatmap__foot">
        <span className="heatmap__count">
          {start + 1}–{Math.min(total, start + slice.length)} of {total}
        </span>
        <Pagination
          page={safePage}
          totalPages={totalPages}
          basePath={basePath}
          pageParam={pageParam}
        />
      </footer>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  basePath,
  pageParam,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  pageParam: string;
}) {
  if (totalPages <= 1) return null;
  const pageHref = (n: number) => {
    const sep = basePath.includes("?") ? "&" : "?";
    return `${basePath}${sep}${pageParam}=${n}`;
  };
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  return (
    <nav className="pagination" aria-label="Heatmap pagination">
      <Link
        className="pagination__btn"
        href={pageHref(prev)}
        aria-disabled={page === 1}
        aria-label="Previous page"
      >
        ←
      </Link>
      <span className="pagination__label">
        page {page} / {totalPages}
      </span>
      <Link
        className="pagination__btn"
        href={pageHref(next)}
        aria-disabled={page === totalPages}
        aria-label="Next page"
      >
        →
      </Link>
    </nav>
  );
}
