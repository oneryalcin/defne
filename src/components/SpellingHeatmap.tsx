import Link from "next/link";
import {
  SPELLING_FILL,
  SPELLING_LABELS,
  spellingProgressStatus,
  type SpellingProgressStatus,
} from "@/components/ProgressDistribution";

export interface SpellingHeatmapItem {
  id: string;
  target: string;
  usageLabel?: string | null;
  teachingNote?: string | null;
  commonMisspelling?: string | null;
  promptCount: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
}

const STATUS_RANK: Record<SpellingProgressStatus, number> = {
  needs_work: 0,
  practising: 1,
  spotted_once: 2,
  reliable: 3,
  steady: 4,
  not_started: 5
};

export function SpellingHeatmap({
  words,
  page,
  pageSize,
  basePath,
  pageParam = "p",
  variant = "child",
  detailQuery = "",
}: {
  words: SpellingHeatmapItem[];
  page: number;
  pageSize: number;
  basePath: string;
  pageParam?: string;
  variant?: "parent" | "child";
  detailQuery?: string;
}) {
  const enriched = words
    .map((word) => ({ word, status: spellingProgressStatus(word) }))
    .sort((a, b) => {
      if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
        return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      }
      return a.word.target.localeCompare(b.word.target);
    });

  const total = enriched.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  const slice = enriched.slice(start, start + pageSize);

  return (
    <div className="heatmap" aria-label="Spelling progress heatmap">
      <div className="heatmap__legend" aria-hidden="true">
        {(["not_started", "needs_work", "practising", "spotted_once", "reliable", "steady"] as SpellingProgressStatus[]).map(
          (status) => (
            <span key={status}>
              <span className="heatmap__dot" style={{ background: SPELLING_FILL[status] }} />
              {SPELLING_LABELS[status]}
            </span>
          )
        )}
      </div>

      <div className="heatmap__grid" role="list">
        {slice.map(({ word, status }) => {
          const content = (
            <>
              <span className="heatmap-cell__word">{word.target}</span>
              <span className="heatmap-cell__pop" role="tooltip">
                <strong>{word.target}</strong>
                <span className="heatmap-cell__state">{SPELLING_LABELS[status]}</span>
                <span className="heatmap-cell__stats">{spellingStats(word)}</span>
                <ul className="heatmap-cell__why">
                  {word.usageLabel ? <li>{word.usageLabel}</li> : null}
                  {word.commonMisspelling ? <li>Watch for: {word.commonMisspelling}</li> : null}
                  {word.teachingNote ? <li>{word.teachingNote}</li> : null}
                  <li>{word.promptCount} sentence clue{word.promptCount === 1 ? "" : "s"} ready</li>
                </ul>
                {variant === "parent" ? (
                  <span className="heatmap-cell__action">Open spelling page →</span>
                ) : null}
              </span>
            </>
          );

          return variant === "parent" ? (
            <Link
              key={word.id}
              role="listitem"
              className="heatmap-cell spelling-heatmap-cell"
              style={{ background: SPELLING_FILL[status] }}
              href={`/parent/spelling/${word.id}${detailQuery}`}
              prefetch={false}
            >
              {content}
            </Link>
          ) : (
            <div
              key={word.id}
              role="listitem"
              tabIndex={0}
              className="heatmap-cell spelling-heatmap-cell"
              style={{ background: SPELLING_FILL[status] }}
            >
              {content}
            </div>
          );
        })}
      </div>

      <footer className="heatmap__foot">
        <span className="heatmap__count">
          {total === 0 ? "0 of 0" : `${start + 1}-${Math.min(total, start + slice.length)} of ${total}`}
        </span>
        <Pagination page={safePage} totalPages={totalPages} basePath={basePath} pageParam={pageParam} />
      </footer>
    </div>
  );
}

function spellingStats(word: SpellingHeatmapItem): string {
  if (word.attemptCount === 0) return "Not tried yet";
  return `Seen ${word.attemptCount}, correct ${word.correctCount}, missed ${word.wrongCount}`;
}

function Pagination({
  page,
  totalPages,
  basePath,
  pageParam
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
    <nav className="pagination" aria-label="Spelling list pagination">
      <Link className="pagination__btn" href={pageHref(prev)} aria-disabled={page === 1} aria-label="Previous page">
        {"<-"}
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
        {"->"}
      </Link>
    </nav>
  );
}
