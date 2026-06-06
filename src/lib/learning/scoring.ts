// Mastery scoring v2 — Wilson lower-bound on a recency-weighted ratio
// of clean-correct vs wrong attempts. See
// docs/mastery-scoring-and-selection-v2.md for rationale.
//
// Why time-weighted instead of raw aggregates? Because "5 corrects last
// week, 2 wrongs today" should look much weaker than 5/7 raw — the
// recent wrongs are evidence that the word has been forgotten and the
// older corrects are stale. The weight of an attempt decays with a
// 7-day half-life. Recent attempts dominate; older attempts decay
// toward zero but never disappear entirely.

import type {
  AttemptRecord,
  LearnerWordState,
  MasteryColour,
  PracticeWord,
} from "../types";
import { DEFAULT_NEAR_REVIEW_SPACING, mistakeRecencyWeight } from "./rounds";

export interface ScoreBreakdown {
  /** Bucket the UI should render. null when the word has never been answered. */
  colour: MasteryColour | null;
  /** Naive correct ratio (effectiveCorrect / (effectiveCorrect + wrongs)). */
  pHat: number;
  /** Wilson 90% lower bound. Drives the colour. */
  lowerBound: number;
  /** Time-weighted sample size (after hint discount). */
  effectiveN: number;
  /** Plain-English explanations (one line each) for tooltip / debugging. */
  reasons: string[];
}

export interface PriorityBreakdown {
  score: number;
  factors: Array<{
    name: string;
    value: number;
    weight: number;
    contribution: number;
    note: string;
  }>;
}

/** Half-life of an attempt's evidence weight, in days. */
export const RECENCY_HALF_LIFE_DAYS = 7;
// 80% one-sided. Calibrated for kid-scale data where ~5 clean attempts
// should be enough to clear Reliable. A higher z (90% / 95%) would mean
// the lower bound needs ~10+ clean correct attempts to leave 'yellow',
// which feels mathematically pure but emotionally punishing.
const WILSON_Z = 0.84;
const HINT_LEVELS = 4;
const REVIEW_THRESHOLD = 0.72;
const RELIABLE_LOWER = 0.7;
const MASTERED_LOWER = 0.8;
const MASTERED_STABILITY_DAYS = 7;
const MASTERED_MIN_CORRECT = 4;
const MINUTES_TOO_RECENT = 12;
const RECENT_WRONG_KNOCKDOWN_HOURS = 36;
const MIN_EVIDENCE_N = 0.3;
const BUILDING_LOWER = 0.3;

function daysBetween(fromIso: string | null, toIso: string): number {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (to - from) / 86_400_000);
}

function recallProbability(daysSinceSeen: number, stabilityDays: number): number {
  if (!Number.isFinite(daysSinceSeen)) return 0;
  return Math.exp(-daysSinceSeen / Math.max(1, stabilityDays));
}

function wilsonLower(pHat: number, n: number, z = WILSON_Z): number {
  if (n <= 0) return 0;
  const center = pHat + (z * z) / (2 * n);
  const margin = z * Math.sqrt((pHat * (1 - pHat)) / n + (z * z) / (4 * n * n));
  const denom = 1 + (z * z) / n;
  return Math.max(0, (center - margin) / denom);
}

function firstAttemptsClean(state: LearnerWordState): boolean {
  return (
    state.attemptCount >= 2 &&
    state.correctCount >= 2 &&
    state.wrongCount === 0 &&
    state.averageHintLevelUsed <= 0.5
  );
}

function hasMasteredEvidence(
  state: LearnerWordState,
  lowerBound: number,
  unresolvedRecentWrong: boolean
): boolean {
  return (
    lowerBound >= MASTERED_LOWER &&
    state.stabilityDays >= MASTERED_STABILITY_DAYS &&
    state.correctCount >= MASTERED_MIN_CORRECT &&
    state.averageHintLevelUsed <= 0.5 &&
    state.recoveryDebt <= 0 &&
    !state.nearReview &&
    !unresolvedRecentWrong
  );
}

function hasCleanSuccessHistory(state: LearnerWordState): boolean {
  return state.correctCount >= 2 && state.wrongCount === 0 && state.averageHintLevelUsed <= 0.5;
}

function hasSmallSlipInStrongHistory(state: LearnerWordState): boolean {
  if (state.attemptCount < 5) return false;
  if (state.wrongCount === 0) return false;
  const wrongRatio = state.wrongCount / state.attemptCount;
  return state.correctCount / state.attemptCount >= 0.8 && wrongRatio <= 0.15 && state.averageHintLevelUsed <= 0.5;
}

interface WeightedTotals {
  effectiveCorrect: number;
  wrongs: number;
  effectiveN: number;
  oldestDays: number;
  newestDays: number;
  hadRecentWrong: boolean;
  /** Did we use the time-weighted path (true) or the aggregate fallback (false)? */
  weighted: boolean;
}

function computeWeightedTotals(
  state: LearnerWordState,
  attempts: AttemptRecord[] | null,
  nowIso: string
): WeightedTotals {
  // Hints are not counted as a sample-size discount here. They feed the
  // 'firstAttemptsClean' Reliable gate instead — a heavy-hint correct
  // answer can still raise the lower bound, but it cannot promote the
  // word to Reliable on its own.
  if (attempts && attempts.length > 0) {
    let correctWeighted = 0;
    let wrongs = 0;
    let oldestDays = 0;
    let newestDays = Number.POSITIVE_INFINITY;
    let hadRecentWrong = false;
    for (const a of attempts) {
      const ageDays = daysBetween(a.answeredAt, nowIso);
      if (!Number.isFinite(ageDays)) continue;
      oldestDays = Math.max(oldestDays, ageDays);
      newestDays = Math.min(newestDays, ageDays);
      const weight = Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
      if (a.isCorrect) {
        correctWeighted += weight;
      } else {
        wrongs += weight;
        if (ageDays * 24 < RECENT_WRONG_KNOCKDOWN_HOURS) hadRecentWrong = true;
      }
    }
    return {
      effectiveCorrect: correctWeighted,
      wrongs,
      effectiveN: correctWeighted + wrongs,
      oldestDays,
      newestDays: Number.isFinite(newestDays) ? newestDays : 0,
      hadRecentWrong,
      weighted: true,
    };
  }

  // Fallback: no per-attempt series. Use aggregates.
  const correct = state.correctCount;
  const wrongs = state.wrongCount;
  // If we have attempts but no lastSeenAt (in-memory test fixture),
  // assume they happened just now so freshness does not collapse to 0.
  const newestDays = state.lastSeenAt ? daysBetween(state.lastSeenAt, nowIso) : 0;
  return {
    effectiveCorrect: correct,
    wrongs,
    effectiveN: correct + wrongs,
    oldestDays: newestDays,
    newestDays,
    hadRecentWrong: state.lastWrongAt
      ? daysBetween(state.lastWrongAt, nowIso) * 24 < RECENT_WRONG_KNOCKDOWN_HOURS
      : false,
    weighted: false,
  };
}

/**
 * Map a learner-word state to a colour + confidence band + readable reasons.
 *
 * Pipeline:
 *   1. Time-weight every attempt with a 7-day half-life (recent ≫ stale).
 *   2. Discount each correct by the hint level used during that attempt.
 *   3. Compute Wilson 90% lower bound on the weighted ratio.
 *   4. Bucket the lower bound + apply gates:
 *        Reliable requires 2 clean firsts as a floor; Mastered requires
 *        strong current evidence, stability, low hint dependency, and no
 *        active recovery debt. Old mistakes can be outgrown.
 *   5. Knock-down rule: an unresolved recent wrong forces colour down at most
 *      one bucket. A mistake stops dragging the colour down after enough clean
 *      follow-up questions clear near-review.
 */
export function scoreFromState(
  state: LearnerWordState,
  attempts: AttemptRecord[] | null = null,
  nowIso: string = new Date().toISOString()
): ScoreBreakdown {
  if (state.attemptCount === 0) {
    return {
      colour: null,
      pHat: 0,
      lowerBound: 0,
      effectiveN: 0,
      reasons: ["Not started yet — first practice will set the colour."],
    };
  }

  const reasons: string[] = [];
  const totals = computeWeightedTotals(state, attempts, nowIso);

  reasons.push(
    `${state.correctCount} correct / ${state.wrongCount} wrong over ${state.attemptCount} attempts.`
  );
  if (totals.weighted) {
    reasons.push(
      `Recency-weighted (7-day half-life): effective ${totals.effectiveCorrect.toFixed(2)} correct vs ${totals.wrongs.toFixed(2)} wrong (n_eff=${totals.effectiveN.toFixed(2)}).`
    );
  }
  if (state.averageHintLevelUsed > 0.5) {
    reasons.push(
      `Hint use averaged ${state.averageHintLevelUsed.toFixed(1)} of ${HINT_LEVELS} — Reliable gate disabled until two clean firsts.`
    );
  }

  const recall =
    Number.isFinite(totals.newestDays) && totals.newestDays > 0
      ? recallProbability(totals.newestDays, state.stabilityDays)
      : 1;
  const freshness = 0.6 + 0.4 * recall;

  if (totals.effectiveN < MIN_EVIDENCE_N) {
    if (hasCleanSuccessHistory(state)) {
      reasons.push("Clean success evidence is old, so this needs a refresh rather than being treated as a failure.");
      return {
        colour: "orange",
        pHat: 1,
        lowerBound: BUILDING_LOWER,
        effectiveN: totals.effectiveN,
        reasons,
      };
    }
    reasons.push("Not enough clean evidence yet — colour starts at red.");
    return {
      colour: "red",
      pHat: 0,
      lowerBound: 0,
      effectiveN: totals.effectiveN,
      reasons,
    };
  }

  const pHat =
    totals.effectiveCorrect /
    Math.max(0.001, totals.effectiveCorrect + totals.wrongs);
  const wilson = wilsonLower(pHat, totals.effectiveN);
  let lowerBound = wilson * freshness;
  reasons.push(
    `Confidence (Wilson 80% lower): ${(wilson * 100).toFixed(0)}% on n_eff=${totals.effectiveN.toFixed(2)}.`
  );
  if (Number.isFinite(totals.newestDays) && totals.newestDays >= 1 && recall < 0.85) {
    reasons.push(
      `Last seen ${totals.newestDays.toFixed(1)}d ago (recall ≈ ${(recall * 100).toFixed(0)}%) — score dampened to ${(lowerBound * 100).toFixed(0)}%.`
    );
  }
  const unresolvedRecentWrong = totals.hadRecentWrong && needsMistakeRecovery(state, attempts);
  if (unresolvedRecentWrong) {
    reasons.push(
      `Recent wrong still in recovery — knocked down one bucket until ${DEFAULT_NEAR_REVIEW_SPACING} clean follow-up questions clear it.`
    );
  }
  if (!unresolvedRecentWrong && hasSmallSlipInStrongHistory(state) && lowerBound < BUILDING_LOWER) {
    lowerBound = BUILDING_LOWER;
    reasons.push("One small slip inside a strong history is treated as a refresh need, not Needs work.");
  }

  const clean = firstAttemptsClean(state);
  const masteredEvidence = hasMasteredEvidence(state, lowerBound, unresolvedRecentWrong);
  let colour: MasteryColour;
  if (masteredEvidence) {
    colour = "green";
    if (!clean && state.wrongCount > 0) {
      reasons.push("Old mistakes have been outweighed by stable clean evidence — marked Mastered.");
    }
  } else if (clean) {
    // Spec: 2 first attempts both clean → Reliable as a floor.
    colour = "light_green";
    if (lowerBound < MASTERED_LOWER) {
      reasons.push(
        `First-pair clean → Reliable; needs ≥${(MASTERED_LOWER * 100).toFixed(0)}% confidence for Mastered.`
      );
    } else if (state.stabilityDays < MASTERED_STABILITY_DAYS) {
      reasons.push(
        `First-pair clean → Reliable; needs ${MASTERED_STABILITY_DAYS}d stability for Mastered (currently ${state.stabilityDays.toFixed(1)}d).`
      );
    } else if (state.correctCount < MASTERED_MIN_CORRECT) {
      reasons.push(
        `First-pair clean → Reliable; needs ${MASTERED_MIN_CORRECT} correct attempts for Mastered (currently ${state.correctCount}).`
      );
    } else if (state.averageHintLevelUsed > 0.5) {
      reasons.push("First-pair clean → Reliable; needs lower hint dependency for Mastered.");
    } else if (state.recoveryDebt > 0 || state.nearReview) {
      reasons.push("First-pair clean → Reliable; needs mistake recovery cleared for Mastered.");
    }
  } else if (lowerBound < BUILDING_LOWER) {
    colour = "red";
  } else if (lowerBound < 0.55) {
    colour = "orange";
  } else if (lowerBound < RELIABLE_LOWER) {
    colour = "yellow";
  } else {
    colour = "light_green";
    if (lowerBound >= MASTERED_LOWER) {
      if (state.stabilityDays < MASTERED_STABILITY_DAYS) {
        reasons.push(
          `Score is high; needs ${MASTERED_STABILITY_DAYS}d stability for Mastered (currently ${state.stabilityDays.toFixed(1)}d).`
        );
      } else if (state.correctCount < MASTERED_MIN_CORRECT) {
        reasons.push(
          `Score is high; needs ${MASTERED_MIN_CORRECT} correct attempts for Mastered (currently ${state.correctCount}).`
        );
      } else if (state.averageHintLevelUsed > 0.5) {
        reasons.push("Score is high; needs lower hint dependency for Mastered.");
      } else if (state.recoveryDebt > 0 || state.nearReview) {
        reasons.push("Score is high; needs mistake recovery cleared for Mastered.");
      }
    }
  }

  // Recent-wrong knockdown: a fresh failure should never sit at
  // light_green / green just because old corrects remain in the average.
  if (unresolvedRecentWrong) {
    colour = stepDown(colour);
  }

  return { colour, pHat, lowerBound, effectiveN: totals.effectiveN, reasons };
}

function needsMistakeRecovery(
  state: LearnerWordState,
  attempts: AttemptRecord[] | null
): boolean {
  const cleanFollowUps = cleanCorrectSinceLatestWrong(state, attempts);
  return state.nearReview && cleanFollowUps < DEFAULT_NEAR_REVIEW_SPACING;
}

function cleanCorrectSinceLatestWrong(
  state: LearnerWordState,
  attempts: AttemptRecord[] | null
): number {
  if (!attempts || attempts.length === 0) {
    return state.eligibleQuestionsSinceLastMistake;
  }

  const latestWrongAt = attempts.reduce<number | null>((latest, attempt) => {
    if (attempt.isCorrect) return latest;
    const timestamp = Date.parse(attempt.answeredAt);
    if (!Number.isFinite(timestamp)) return latest;
    return latest === null || timestamp > latest ? timestamp : latest;
  }, null);

  if (latestWrongAt === null) {
    return state.eligibleQuestionsSinceLastMistake;
  }

  const cleanSinceWrong = attempts.filter((attempt) => {
    if (!attempt.isCorrect) return false;
    const timestamp = Date.parse(attempt.answeredAt);
    return Number.isFinite(timestamp) && timestamp > latestWrongAt;
  }).length;

  return Math.max(state.eligibleQuestionsSinceLastMistake, cleanSinceWrong);
}

function stepDown(colour: MasteryColour): MasteryColour {
  switch (colour) {
    case "green":
      return "light_green";
    case "light_green":
      return "yellow";
    case "yellow":
      return "orange";
    case "orange":
      return "red";
    case "red":
      return "red";
  }
}

/**
 * Selection priority for round/session planning. Returns the same scalar
 * priorityScore used by callers, plus a structured breakdown of every
 * factor that contributed — so a debug surface can answer "why this word?".
 */
export function priorityBreakdownForState(
  word: PracticeWord,
  attempts: AttemptRecord[] | null,
  nowIso: string
): PriorityBreakdown {
  const state = word.state;
  const factors: PriorityBreakdown["factors"] = [];
  const breakdown = scoreFromState(state, attempts, nowIso);

  if (state.attemptCount === 0) {
    factors.push({
      name: "fresh-base",
      value: 1,
      weight: 0.4,
      contribution: 0.4,
      note: "Untouched word — picked only when nothing needier is queued.",
    });
    return { score: 0.4, factors };
  }

  if (breakdown.colour === "green") {
    const daysSinceSeen = daysBetween(state.lastSeenAt, nowIso);
    const recall = recallProbability(daysSinceSeen, state.stabilityDays);
    const due = 1 - recall;
    factors.push({
      name: "mastered-floor",
      value: 1,
      weight: 0.05,
      contribution: 0.05,
      note: "Mastered words rarely surface — only for occasional refresh.",
    });
    factors.push({
      name: "due-by-decay",
      value: due,
      weight: 0.15,
      contribution: due * 0.15,
      note: `Recall has decayed to ${(recall * 100).toFixed(0)}% (last seen ${formatDays(daysSinceSeen)} ago).`,
    });
    const score = factors.reduce((sum, f) => sum + f.contribution, 0);
    return { score, factors };
  }

  const daysSinceSeen = daysBetween(state.lastSeenAt, nowIso);
  const recall = recallProbability(daysSinceSeen, state.stabilityDays);
  const due = 1 - recall;
  const weakness = 1 - breakdown.lowerBound;

  factors.push({
    name: "due-by-decay",
    value: due,
    weight: 1.2,
    contribution: due * 1.2,
    note: `Recall has decayed to ${(recall * 100).toFixed(0)}% (last seen ${formatDays(daysSinceSeen)} ago).`,
  });
  factors.push({
    name: "confidence-gap",
    value: weakness,
    weight: 0.8,
    contribution: weakness * 0.8,
    note: `Lower bound is ${(breakdown.lowerBound * 100).toFixed(0)}% — ${(weakness * 100).toFixed(0)}% of the way to sure.`,
  });

  const hoursSinceWrong = daysBetween(state.lastWrongAt, nowIso) * 24;
  if (Number.isFinite(hoursSinceWrong) && state.lastWrongAt) {
    const recencyWeight = mistakeRecencyWeight(hoursSinceWrong);
    factors.push({
      name: "recent-failure",
      value: recencyWeight,
      weight: 0.45,
      contribution: recencyWeight * 0.45,
      note: `Wrong ${hoursSinceWrong.toFixed(1)}h ago — bumped to surface again soon.`,
    });
  }

  if (breakdown.lowerBound >= 0.55 && breakdown.lowerBound < RELIABLE_LOWER) {
    factors.push({
      name: "almost-mastered",
      value: 1,
      weight: 0.18,
      contribution: 0.18,
      note: "Just below Reliable — one more clean proof would tip it.",
    });
  }
  if (Number.isFinite(daysSinceSeen) && daysSinceSeen >= 1 && recall < REVIEW_THRESHOLD) {
    factors.push({
      name: "delayed-recall",
      value: 1,
      weight: 0.2,
      contribution: 0.2,
      note: "It has been more than a day; getting it now is stronger evidence.",
    });
  }
  if (
    Number.isFinite(daysSinceSeen) &&
    daysSinceSeen * 24 * 60 < MINUTES_TOO_RECENT &&
    !state.lastWrongAt
  ) {
    factors.push({
      name: "too-recent-penalty",
      value: 1,
      weight: -0.55,
      contribution: -0.55,
      note: "Just answered correctly — held back to avoid back-to-back asks.",
    });
  }

  const score = factors.reduce((sum, f) => sum + f.contribution, 0);
  return { score, factors };
}

function formatDays(days: number): string {
  if (!Number.isFinite(days)) return "—";
  if (days < 1 / 24) return "moments";
  if (days < 1) return `${(days * 24).toFixed(1)}h`;
  return `${days.toFixed(1)}d`;
}
