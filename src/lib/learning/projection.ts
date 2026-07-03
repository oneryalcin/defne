// Projection helpers for the per-word debug surface. Given the live
// deck (every word + its current state) we can answer questions like:
//
//   * Where does this word rank against the others *today*?
//   * If the learner does nothing, when does its priority cross into
//     'will be picked' territory?
//   * What does its forgetting curve look like over the next 14 days?
//
// These are explainability primitives — they don't change the
// selector. They just simulate the same math the selector uses, with
// the rest of the deck held constant.

import type { LearnerWordState, PracticeWord } from "../types";
import { selectRoundWords } from "./roundSelection";
import { priorityBreakdownForState, type PriorityBreakdown } from "./scoring";

const PICK_TOP_N = 12;

/** Sigmoid converting rank → "will be picked next round" probability. */
export function rankToProbability(rank: number): number {
  // Anchor: rank 1 → ~0.99, rank 12 → ~0.50, rank 20 → ~0.10.
  const centered = rank - PICK_TOP_N;
  return 1 / (1 + Math.exp(0.4 * centered));
}

export interface DeckPriorityRow {
  wordId: string;
  word: string;
  score: number;
}

/**
 * Score the whole deck so a single word can be ranked against the others.
 * Caller passes the canonical word list + per-word attempt history map
 * (already loaded in the repository) — this function just runs the
 * priority math.
 */
export function deckPriorities(
  words: PracticeWord[],
  attemptsByWordId: Map<string, Array<{ answeredAt: string; isCorrect: boolean; hintLevelUsed: number }>>,
  nowIso: string
): DeckPriorityRow[] {
  return words
    .map((word) => ({
      wordId: word.id,
      word: word.word,
      score: priorityBreakdownForState(word, attemptsByWordId.get(word.id) ?? null, nowIso).score,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Rank a specific word against the rest of the deck. 1-indexed.
 */
export function rankFor(deck: DeckPriorityRow[], wordId: string): {
  rank: number;
  total: number;
  score: number | null;
} {
  const idx = deck.findIndex((row) => row.wordId === wordId);
  if (idx === -1) return { rank: deck.length, total: deck.length, score: null };
  return { rank: idx + 1, total: deck.length, score: deck[idx].score };
}

export interface DayProjection {
  daysFromNow: number;
  recall: number;
  /** Priority score the *target* word would have at this day (everyone else held still). */
  projectedScore: number;
  /** Where it would rank against the rest of the deck. */
  projectedRank: number;
  /** Rank-based probability, gated by actual selector eligibility at that day. */
  probability: number;
  /** This word's priority breakdown at this day, for tooltips. */
  breakdown: PriorityBreakdown;
}

/**
 * Project this word forward day-by-day. Critically, we age the *entire*
 * deck by the same number of days, not just the target — otherwise this
 * word's dueScore rises while everyone else's stays still, and the
 * projection over-estimates pick probability dramatically.
 */
export function projectWord(
  word: PracticeWord,
  attempts: Array<{ answeredAt: string; isCorrect: boolean; hintLevelUsed: number }> | null,
  otherWordsFull: PracticeWord[],
  attemptsByWordId: Map<string, Array<{ answeredAt: string; isCorrect: boolean; hintLevelUsed: number }>>,
  startIso: string,
  days: number
): DayProjection[] {
  const start = new Date(startIso).getTime();
  const out: DayProjection[] = [];

  for (let d = 0; d <= days; d += 1) {
    const projectedIso = new Date(start + d * 86_400_000).toISOString();
    const breakdown = priorityBreakdownForState(word, attempts, projectedIso);

    // Re-score every other word at this projected day too. Equal aging
    // → relative ranks stay roughly stable, the chart no longer pretends
    // only this word's dueScore moves.
    let rank = 1;
    for (const other of otherWordsFull) {
      if (other.id === word.id) continue;
      const otherScore = priorityBreakdownForState(
        other,
        attemptsByWordId.get(other.id) ?? null,
        projectedIso
      ).score;
      if (otherScore > breakdown.score) rank += 1;
    }
    const selectedWordIds = new Set(
      selectRoundWords(otherWordsFull, projectedIso, 12, {
        revealAndMoveOnWordIds: [],
        eventuallyCorrectNotFirstAttemptWordIds: [],
      }).wordIds
    );

    const stability = Math.max(1, word.state.stabilityDays);
    const daysSinceSeen = word.state.lastSeenAt
      ? (new Date(projectedIso).getTime() -
          new Date(word.state.lastSeenAt).getTime()) /
        86_400_000
      : Number.POSITIVE_INFINITY;
    const recall = Number.isFinite(daysSinceSeen)
      ? Math.exp(-Math.max(0, daysSinceSeen) / stability)
      : 0;

    out.push({
      daysFromNow: d,
      recall,
      projectedScore: breakdown.score,
      projectedRank: rank,
      probability: selectedWordIds.has(word.id) ? rankToProbability(rank) : 0,
      breakdown,
    });
  }
  return out;
}

/**
 * The bucket thresholds duplicated here (kept in sync with scoring.ts)
 * so the explainability page can render "to reach the next bucket you
 * need lowerBound ≥ X" without importing private constants.
 */
export const BUCKET_THRESHOLDS = {
  red: { upperLowerBound: 0.3, label: "Needs work" },
  orange: { upperLowerBound: 0.55, label: "Building" },
  yellow: { upperLowerBound: 0.7, label: "Nearly steady" },
  light_green: { upperLowerBound: 0.77, label: "Reliable" },
  green: { upperLowerBound: 1.0, label: "Mastered" },
} as const;

export function nextBucketTarget(
  currentLowerBound: number
): { label: string; threshold: number } | null {
  if (currentLowerBound < 0.3) return { label: "Building", threshold: 0.3 };
  if (currentLowerBound < 0.55) return { label: "Nearly steady", threshold: 0.55 };
  if (currentLowerBound < 0.7) return { label: "Reliable", threshold: 0.7 };
  if (currentLowerBound < 0.77) return { label: "Mastered", threshold: 0.77 };
  return null;
}
