import type {
  LearnerWordState,
  MasteryColour,
  MasteryDimension,
  PracticeAttemptOutcome,
  PracticeWord,
  QuestionType,
  SessionPlanItem
} from "../types";
import { mistakeRecencyWeight } from "./rounds";

// Vocabulary practice does not test spelling production; the spelling
// dimension is intentionally ignored when scoring.

const MINUTES_TOO_RECENT = 12;
const REVIEW_THRESHOLD = 0.72;
const RELIABLE_THRESHOLD = 0.78;
const MASTERED_THRESHOLD = 0.85;
const MASTERED_STABILITY_DAYS = 7;
const MASTERED_MIN_CORRECT = 4;

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function daysBetween(fromIso: string | null, toIso: string): number {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (to - from) / 86_400_000);
}

export function recallProbability(daysSinceSeen: number, stabilityDays: number): number {
  if (!Number.isFinite(daysSinceSeen)) return 0;
  return Math.exp(-daysSinceSeen / Math.max(1, stabilityDays));
}

// Only meaning + usage are scored. Returns null when neither has been
// attempted yet (the word has not been started in any scoring dimension).
export function attemptedDimensionScores(
  state: Pick<LearnerWordState, "meaningMastery" | "usageMastery">
): number[] {
  const dims: number[] = [];
  if (state.meaningMastery > 0) dims.push(state.meaningMastery);
  if (state.usageMastery > 0) dims.push(state.usageMastery);
  return dims;
}

export function weakestMastery(
  state: Pick<LearnerWordState, "meaningMastery" | "usageMastery" | "spellingMastery">
): number {
  // Backwards-compatible export — used by callers that still expect a single
  // weakness number. Spelling no longer factors in.
  return Math.min(state.meaningMastery, state.usageMastery);
}

export function weakestDimension(
  state: Pick<LearnerWordState, "meaningMastery" | "usageMastery" | "spellingMastery">
): MasteryDimension {
  return state.meaningMastery <= state.usageMastery ? "meaning" : "usage";
}

function firstAttemptsClean(state: LearnerWordState): boolean {
  return (
    state.attemptCount >= 2 &&
    state.correctCount >= 2 &&
    state.wrongCount === 0 &&
    state.averageHintLevelUsed <= 0.5
  );
}

export function masteryColourForState(state: LearnerWordState): MasteryColour {
  // Words that have never been answered live in a "Not started" bucket
  // — surfaced as red so they are still picked, but the parent UI labels
  // them separately.
  if (state.attemptCount === 0) return "red";

  const dims = attemptedDimensionScores(state);
  if (dims.length === 0) {
    // Attempted but never scored above zero (e.g. wrong on first try).
    return state.wrongCount > 0 ? "red" : "orange";
  }
  const weakest = Math.min(...dims);

  if (weakest < 0.35) return "red";
  if (weakest < 0.6) return "orange";
  if (weakest < RELIABLE_THRESHOLD) return "yellow";

  // Reliable = high score AND first two attempts both clean (no wrongs, low hints).
  const clean = firstAttemptsClean(state);
  if (!clean) return "yellow";

  // Mastered = Reliable + survived decay (longer stability, more correct attempts).
  if (
    weakest >= MASTERED_THRESHOLD &&
    state.stabilityDays >= MASTERED_STABILITY_DAYS &&
    state.correctCount >= MASTERED_MIN_CORRECT
  ) {
    return "green";
  }

  return "light_green";
}

export function dimensionForQuestion(questionType: QuestionType): MasteryDimension {
  switch (questionType) {
    case "definition_choice":
    case "synonym_choice":
    case "antonym_choice":
      return "meaning";
    case "sentence_usage_choice":
    case "fill_sentence":
    case "confusable_choice":
      return "usage";
    case "spelling_choice":
    case "type_from_memory":
      // Spelling questions still update the spelling dimension internally so
      // existing data stays valid, but the colour ignores it.
      return "spelling";
  }
}

export function priorityScore(word: PracticeWord, nowIso: string): number {
  const state = word.state;
  const colour = masteryColourForState(state);

  // Untouched words: low base priority — only picked when nothing needier
  // is in the queue.
  if (state.attemptCount === 0) {
    return 0.4;
  }

  // Mastered words: rare refresh, only when forgetting curve has decayed.
  if (colour === "green") {
    const daysSinceSeen = daysBetween(state.lastSeenAt, nowIso);
    const recall = recallProbability(daysSinceSeen, state.stabilityDays);
    return 0.05 + (1 - recall) * 0.15; // tops out around 0.2
  }

  const daysSinceSeen = daysBetween(state.lastSeenAt, nowIso);
  const recall = recallProbability(daysSinceSeen, state.stabilityDays);
  const dueScore = 1 - recall;
  const weakestScore = 1 - weakestMastery(state);

  const hoursSinceWrong = daysBetween(state.lastWrongAt, nowIso) * 24;
  const recentFailureBonus = Number.isFinite(hoursSinceWrong)
    ? 0.45 * mistakeRecencyWeight(hoursSinceWrong)
    : 0;
  const almostMasteredBonus =
    weakestMastery(state) >= 0.75 && weakestMastery(state) < 0.9 ? 0.18 : 0;
  const delayedRecallBonus =
    daysSinceSeen >= 1 && recall < REVIEW_THRESHOLD ? 0.2 : 0;
  const tooRecentPenalty =
    daysSinceSeen * 24 * 60 < MINUTES_TOO_RECENT && !state.lastWrongAt ? 0.55 : 0;

  return (
    dueScore * 1.2 +
    weakestScore * 0.8 +
    recentFailureBonus +
    almostMasteredBonus +
    delayedRecallBonus -
    tooRecentPenalty
  );
}

export function updateStateAfterAttempt(
  state: LearnerWordState,
  outcome: PracticeAttemptOutcome
): LearnerWordState {
  const dimension = dimensionForQuestion(outcome.questionType);
  const previousAttempts = state.attemptCount;
  const daysSinceSeen = daysBetween(state.lastSeenAt, outcome.answeredAt);
  const hintPenalty = Math.min(0.7, outcome.hintLevelUsed * 0.22);
  // Production bonus only for usage production (fill sentence). Spelling
  // production is no longer rewarded since we don't grade it.
  const productionBonus = outcome.questionType === "fill_sentence" ? 0.035 : 0;
  // Delay matters: getting it right after a real gap is stronger evidence.
  const delayBonus = daysSinceSeen >= 1 ? 0.035 : 0;
  // Speed deliberately ignored — kids may take longer; we are not measuring
  // response time as a learning signal.

  const baseIncrease = 0.12 + productionBonus + delayBonus - hintPenalty;
  const increase =
    outcome.masteryCredit === "recovery"
      ? Math.max(0, Math.min(0.015, baseIncrease * 0.18))
      : Math.max(0.018, baseIncrease);
  const decrease = outcome.hintLevelUsed > 0 ? 0.08 : 0.12;

  const next: LearnerWordState = {
    ...state,
    lastSeenAt: outcome.answeredAt,
    lastHintLevelUsed: outcome.hintLevelUsed,
    attemptCount: previousAttempts + 1,
    averageHintLevelUsed:
      (state.averageHintLevelUsed * previousAttempts + outcome.hintLevelUsed) /
      (previousAttempts + 1),
    averageResponseTimeMs:
      (state.averageResponseTimeMs * previousAttempts + outcome.responseTimeMs) /
      (previousAttempts + 1)
  };

  if (outcome.isCorrect) {
    next.correctCount += 1;
    next.lastCorrectAt = outcome.answeredAt;
    next.stabilityDays =
      outcome.masteryCredit === "recovery"
        ? state.stabilityDays
        : state.stabilityDays * (daysSinceSeen >= 1 ? 1.4 : 1.1);
    setDimension(next, dimension, clamp01(getDimension(next, dimension) + increase));
  } else {
    next.wrongCount += 1;
    next.lastWrongAt = outcome.answeredAt;
    next.nearReview = true;
    next.eligibleQuestionsSinceLastMistake = 0;
    next.stabilityDays = Math.max(1, state.stabilityDays * 0.5);
    setDimension(next, dimension, clamp01(getDimension(next, dimension) - decrease));
    if (outcome.failureType !== "none" && !next.failureTypes.includes(outcome.failureType)) {
      next.failureTypes = [...next.failureTypes, outcome.failureType];
    }
  }

  next.nextReviewAt = nextReviewAt(next, outcome.isCorrect, outcome.answeredAt);
  next.masteryColour = masteryColourForState(next);
  return next;
}

export function selectSessionPlan(
  words: PracticeWord[],
  nowIso: string,
  targetCount = 15
): SessionPlanItem[] {
  const ranked = [...words]
    .map((word) => ({
      word,
      score: priorityScore(word, nowIso),
      colour: masteryColourForState(word.state)
    }))
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      return Math.random() - 0.5;
    });

  const struggling = ranked.filter(({ word, colour }) => {
    if (word.state.attemptCount === 0) return false; // not yet started
    return colour === "red" || colour === "orange";
  });
  const review = ranked.filter(({ word, colour }) => {
    if (word.state.attemptCount === 0) return false;
    if (colour === "green") return false;
    const recall = recallProbability(
      daysBetween(word.state.lastSeenAt, nowIso),
      word.state.stabilityDays
    );
    return recall < REVIEW_THRESHOLD;
  });
  const almost = ranked.filter(({ word }) => {
    const weakest = weakestMastery(word.state);
    return weakest >= 0.75 && weakest < 0.9;
  });
  const fresh = ranked.filter(({ word }) => word.state.attemptCount === 0);
  const maintenance = ranked.filter(
    ({ colour }) => colour === "green"
  );

  const picked = new Map<string, PracticeWord>();
  pickInto(picked, struggling, Math.min(6, targetCount));
  pickInto(picked, review, Math.min(8, targetCount - picked.size));
  pickInto(picked, almost, Math.min(4, targetCount - picked.size));
  pickInto(picked, fresh, Math.min(3, targetCount - picked.size));
  pickInto(picked, ranked, targetCount - picked.size);
  pickInto(picked, maintenance, targetCount - picked.size);

  return [...picked.values()].slice(0, targetCount).map((word, index) => ({
    wordId: word.id,
    questionType: questionTypeForWord(word, index)
  }));
}

function questionTypeForWord(word: PracticeWord, index: number): QuestionType {
  const weak = weakestDimension(word.state);
  if (weak === "usage") {
    const usageTypes: QuestionType[] = ["sentence_usage_choice", "fill_sentence", "confusable_choice"];
    return usageTypes[index % usageTypes.length];
  }
  const meaningTypes: QuestionType[] = ["definition_choice", "synonym_choice", "antonym_choice"];
  return meaningTypes[index % meaningTypes.length];
}

function pickInto(
  picked: Map<string, PracticeWord>,
  candidates: Array<{ word: PracticeWord; score: number }>,
  count: number
): void {
  const targetSize = picked.size + Math.max(0, count);
  for (const { word } of candidates) {
    if (picked.size >= targetSize) break;
    if (!picked.has(word.id)) picked.set(word.id, word);
  }
}

function nextReviewAt(state: LearnerWordState, isCorrect: boolean, answeredAt: string): string {
  const answered = new Date(answeredAt).getTime();
  const hours = isCorrect ? Math.max(12, state.stabilityDays * 18) : 18;
  return new Date(answered + hours * 3_600_000).toISOString();
}

function getDimension(state: LearnerWordState, dimension: MasteryDimension): number {
  if (dimension === "meaning") return state.meaningMastery;
  if (dimension === "usage") return state.usageMastery;
  return state.spellingMastery;
}

function setDimension(state: LearnerWordState, dimension: MasteryDimension, value: number): void {
  if (dimension === "meaning") state.meaningMastery = value;
  if (dimension === "usage") state.usageMastery = value;
  if (dimension === "spelling") state.spellingMastery = value;
}
