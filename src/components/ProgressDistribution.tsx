import type { ParentWordListItem } from "@/lib/db/repository";
import type { ChildSpellingListItem } from "@/lib/db/spellingRepository";
import type { MasteryColour } from "@/lib/types";
import {
  spellingProgressColour,
  spellingProgressStatus,
  type SpellingProgressStatus,
} from "@/lib/learning/spellingProgress";

export { spellingProgressColour, spellingProgressStatus, type SpellingProgressStatus } from "@/lib/learning/spellingProgress";

export interface ProgressBucket {
  key: string;
  label: string;
  count: number;
  fill: string;
}

export const MASTERY_LABELS: Record<MasteryColour, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered",
};

export const MASTERY_KEY: Record<MasteryColour, string> = {
  red: "is-red",
  orange: "is-orange",
  yellow: "is-yellow",
  light_green: "is-light_green",
  green: "is-green",
};

export const MASTERY_FILL: Record<MasteryColour, string> = {
  red: "var(--mastery-red)",
  orange: "var(--mastery-orange)",
  yellow: "var(--mastery-yellow)",
  light_green: "var(--mastery-light)",
  green: "var(--mastery-green)",
};

export const SPELLING_LABELS: Record<SpellingProgressStatus, string> = {
  not_started: "Not tried",
  needs_work: "Needs another look",
  practising: "Practising",
  spotted_once: "Spotted once",
  reliable: "Reliable",
  steady: "Steady spelling",
};

export const SPELLING_FILL: Record<SpellingProgressStatus, string> = {
  not_started: "rgba(31,41,55,0.14)",
  needs_work: "var(--mastery-red)",
  practising: "var(--mastery-orange)",
  spotted_once: "var(--mastery-yellow)",
  reliable: "var(--mastery-light)",
  steady: "var(--mastery-green)",
};

export const SPELLING_KEY: Record<SpellingProgressStatus, string> = {
  not_started: "is-not_started",
  needs_work: "is-red",
  practising: "is-orange",
  spotted_once: "is-yellow",
  reliable: "is-light_green",
  steady: "is-green",
};

const MASTERY_ORDER: MasteryColour[] = ["red", "orange", "yellow", "light_green", "green"];
export const SPELLING_ORDER: SpellingProgressStatus[] = [
  "not_started",
  "needs_work",
  "practising",
  "spotted_once",
  "reliable",
  "steady",
];

export function vocabularyProgressBuckets(words: ParentWordListItem[]): ProgressBucket[] {
  const counts: Record<MasteryColour | "not_started", number> = {
    not_started: 0,
    red: 0,
    orange: 0,
    yellow: 0,
    light_green: 0,
    green: 0,
  };

  for (const word of words) {
    counts[word.masteryColour ?? "not_started"] += 1;
  }

  return [
    {
      key: "not_started",
      label: "Not started",
      count: counts.not_started,
      fill: "rgba(31,41,55,0.18)",
    },
    ...MASTERY_ORDER.map((colour) => ({
      key: colour,
      label: MASTERY_LABELS[colour],
      count: counts[colour],
      fill: MASTERY_FILL[colour],
    })),
  ];
}

type SpellingProgressCounts = Pick<
  ChildSpellingListItem,
  "attemptCount" | "correctCount" | "wrongCount"
>;

export function spellingProgressBuckets(words: SpellingProgressCounts[]): ProgressBucket[] {
  const counts = Object.fromEntries(SPELLING_ORDER.map((status) => [status, 0])) as Record<
    SpellingProgressStatus,
    number
  >;

  for (const word of words) {
    counts[spellingProgressStatus(word)] += 1;
  }

  return SPELLING_ORDER.map((status) => ({
    key: status,
    label: SPELLING_LABELS[status],
    count: counts[status],
    fill: SPELLING_FILL[status],
  }));
}

export function ProgressDistribution({
  buckets,
  ariaLabel,
}: {
  buckets: ProgressBucket[];
  ariaLabel: string;
}) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const denominator = total || 1;

  return (
    <div className="dist" aria-label={ariaLabel}>
      <div className="dist__bar" role="presentation">
        {buckets.map((bucket) => {
          const width = (bucket.count / denominator) * 100;
          return (
            <span
              key={bucket.key}
              className="dist__seg"
              style={{
                width: `${width}%`,
                background: bucket.fill,
                minWidth: bucket.count > 0 ? 6 : 0,
              }}
            />
          );
        })}
      </div>
      <ul className="dist__legend">
        {buckets.map((bucket) => (
          <li key={bucket.key}>
            <span className="dist__dot" style={{ background: bucket.fill }} />
            <span className="dist__label">{bucket.label}</span>
            <span className="dist__count">{bucket.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
