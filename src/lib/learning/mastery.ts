import type {
  LearnerWordState,
  MasteryColour,
  MasteryDimension,
  PracticeAttemptOutcome,
  PracticeWord,
  QuestionType,
  SessionPlanItem
} from "../types";

const MINUTES_TOO_RECENT = 12;
const REVIEW_THRESHOLD = 0.72;

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

export function weakestMastery(state: Pick<LearnerWordState, "meaningMastery" | "usageMastery" | "spellingMastery">): number {
  return Math.min(state.meaningMastery, state.usageMastery, state.spellingMastery);
}

export function weakestDimension(state: Pick<LearnerWordState, "meaningMastery" | "usageMastery" | "spellingMastery">): MasteryDimension {
  const entries: Array<[MasteryDimension, number]> = [
    ["meaning", state.meaningMastery],
    ["usage", state.usageMastery],
    ["spelling", state.spellingMastery]
  ];
  return entries.reduce((weakest, candidate) => (candidate[1] < weakest[1] ? candidate : weakest))[0];
}

export function masteryColourForState(state: LearnerWordState): MasteryColour {
  const weakest = weakestMastery(state);

  if (weakest < 0.35) return "red";
  if (weakest < 0.6) return "orange";
  if (weakest < 0.78) return "yellow";
  if (weakest < 0.9) return "light_green";

  if (state.spellingMastery >= 0.9 && state.stabilityDays >= 3 && state.correctCount >= 3) {
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
      return "spelling";
  }
}

export function priorityScore(word: PracticeWord, nowIso: string): number {
  const state = word.state;
  const daysSinceSeen = daysBetween(state.lastSeenAt, nowIso);
  const recall = recallProbability(daysSinceSeen, state.stabilityDays);
  const dueScore = 1 - recall;
  const weaknessScore = 1 - weakestMastery(state);

  const recentWrongDays = daysBetween(state.lastWrongAt, nowIso);
  const recentFailureBonus = recentWrongDays <= 2 ? 0.45 : 0;
  const spellingTrapBonus = word.spellingNote && state.spellingMastery < 0.75 ? 0.25 : 0;
  const weakest = weakestMastery(state);
  const almostMasteredBonus = weakest >= 0.75 && weakest < 0.9 ? 0.18 : 0;
  const delayedRecallBonus = daysSinceSeen >= 1 && recall < REVIEW_THRESHOLD ? 0.2 : 0;
  const tooRecentPenalty = daysSinceSeen * 24 * 60 < MINUTES_TOO_RECENT && !state.lastWrongAt ? 0.55 : 0;

  return dueScore + weaknessScore + recentFailureBonus + spellingTrapBonus + almostMasteredBonus + delayedRecallBonus - tooRecentPenalty;
}

export function updateStateAfterAttempt(state: LearnerWordState, outcome: PracticeAttemptOutcome): LearnerWordState {
  const dimension = dimensionForQuestion(outcome.questionType);
  const previousAttempts = state.attemptCount;
  const daysSinceSeen = daysBetween(state.lastSeenAt, outcome.answeredAt);
  const hintPenalty = Math.min(0.7, outcome.hintLevelUsed * 0.22);
  const productionBonus = outcome.questionType === "type_from_memory" || outcome.questionType === "fill_sentence" ? 0.035 : 0;
  const delayBonus = daysSinceSeen >= 1 ? 0.035 : 0;
  const speedPenalty = outcome.responseTimeMs > 18_000 ? 0.015 : 0;

  const baseIncrease = 0.12 + productionBonus + delayBonus - hintPenalty - speedPenalty;
  const increase = Math.max(0.018, baseIncrease);
  const decrease = outcome.hintLevelUsed > 0 ? 0.08 : 0.12;

  const next: LearnerWordState = {
    ...state,
    lastSeenAt: outcome.answeredAt,
    lastHintLevelUsed: outcome.hintLevelUsed,
    attemptCount: previousAttempts + 1,
    averageHintLevelUsed:
      (state.averageHintLevelUsed * previousAttempts + outcome.hintLevelUsed) / (previousAttempts + 1),
    averageResponseTimeMs:
      (state.averageResponseTimeMs * previousAttempts + outcome.responseTimeMs) / (previousAttempts + 1)
  };

  if (outcome.isCorrect) {
    next.correctCount += 1;
    next.lastCorrectAt = outcome.answeredAt;
    next.stabilityDays = state.stabilityDays * (daysSinceSeen >= 1 ? 1.4 : 1.1);
    setDimension(next, dimension, clamp01(getDimension(next, dimension) + increase));
  } else {
    next.wrongCount += 1;
    next.lastWrongAt = outcome.answeredAt;
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

export function selectSessionPlan(words: PracticeWord[], nowIso: string, targetCount = 15): SessionPlanItem[] {
  const ranked = [...words]
    .map((word) => ({ word, score: priorityScore(word, nowIso), colour: word.state.masteryColour }))
    .sort((a, b) => b.score - a.score || a.word.word.localeCompare(b.word.word));

  const newOrRed = ranked.filter(({ word }) => word.state.attemptCount === 0 || word.state.masteryColour === "red");
  const review = ranked.filter(({ word }) => {
    const recall = recallProbability(daysBetween(word.state.lastSeenAt, nowIso), word.state.stabilityDays);
    return word.state.attemptCount > 0 && recall < REVIEW_THRESHOLD && word.state.masteryColour !== "green";
  });
  const almost = ranked.filter(({ word }) => {
    const weakest = weakestMastery(word.state);
    return weakest >= 0.75 && weakest < 0.9;
  });
  const maintenance = ranked.filter(({ word }) => word.state.masteryColour === "green");

  const picked = new Map<string, PracticeWord>();
  pickInto(picked, newOrRed, Math.min(5, targetCount));
  pickInto(picked, review, Math.min(8, targetCount - picked.size));
  pickInto(picked, almost, Math.min(4, targetCount - picked.size));
  pickInto(picked, ranked, targetCount - picked.size);
  pickInto(picked, maintenance, targetCount - picked.size);

  return [...picked.values()].slice(0, targetCount).map((word, index) => ({
    wordId: word.id,
    questionType: questionTypeForWord(word, index)
  }));
}

function questionTypeForWord(word: PracticeWord, index: number): QuestionType {
  const weak = weakestDimension(word.state);
  if (weak === "spelling") {
    return index % 2 === 0 ? "type_from_memory" : "spelling_choice";
  }
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
