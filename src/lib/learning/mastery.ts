import type {
  AttemptRecord,
  LearnerWordState,
  MasteryColour,
  PracticeAttemptOutcome,
  PracticeWord,
  QuestionType
} from "../types";
import { DEFAULT_NEAR_REVIEW_SPACING } from "./rounds";
import { priorityBreakdownForState, scoreFromState } from "./scoring";

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

export function masteryColourForState(
  state: LearnerWordState,
  attempts: AttemptRecord[] | null = null
): MasteryColour {
  // Delegated to scoring.ts so colour, priority, and tooltip explanations
  // all read from the same Wilson-lower-bound pipeline. See
  // docs/mastery-scoring-and-selection-v2.md.
  const breakdown = scoreFromState(state, attempts);
  // Untouched words still bucket as red here (callers that want to render
  // a separate 'Not started' state should check attemptCount themselves).
  return breakdown.colour ?? "red";
}

export function dimensionForQuestion(questionType: QuestionType): "meaning" | "usage" | "spelling" {
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

export function priorityScore(
  word: PracticeWord,
  nowIso: string,
  attempts: AttemptRecord[] | null = null
): number {
  return priorityBreakdownForState(word, attempts, nowIso).score;
}

export function updateStateAfterAttempt(
  state: LearnerWordState,
  outcome: PracticeAttemptOutcome
): LearnerWordState {
  const previousAttempts = state.attemptCount;
  const daysSinceSeen = daysBetween(state.lastSeenAt, outcome.answeredAt);
  // Speed deliberately ignored — kids may take longer; we are not measuring
  // response time as a learning signal.

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
    if (state.nearReview || state.lastWrongAt) {
      const eligibleQuestionsSinceLastMistake =
        state.eligibleQuestionsSinceLastMistake + 1;
      next.eligibleQuestionsSinceLastMistake = eligibleQuestionsSinceLastMistake;
      next.nearReview =
        state.nearReview &&
        eligibleQuestionsSinceLastMistake < DEFAULT_NEAR_REVIEW_SPACING;
    }
    next.stabilityDays =
      outcome.masteryCredit === "recovery"
        ? state.stabilityDays
        : state.stabilityDays * (daysSinceSeen >= 1 ? 1.4 : 1.1);
  } else {
    next.wrongCount += 1;
    next.lastWrongAt = outcome.answeredAt;
    next.nearReview = true;
    next.eligibleQuestionsSinceLastMistake = 0;
    next.stabilityDays = Math.max(1, state.stabilityDays * 0.5);
    if (outcome.failureType !== "none" && !next.failureTypes.includes(outcome.failureType)) {
      next.failureTypes = [...next.failureTypes, outcome.failureType];
    }
  }

  next.nextReviewAt = nextReviewAt(next, outcome.isCorrect, outcome.answeredAt);
  next.masteryColour = masteryColourForState(next);
  return next;
}

function nextReviewAt(state: LearnerWordState, isCorrect: boolean, answeredAt: string): string {
  const answered = new Date(answeredAt).getTime();
  const hours = isCorrect ? Math.max(12, state.stabilityDays * 18) : 18;
  return new Date(answered + hours * 3_600_000).toISOString();
}
