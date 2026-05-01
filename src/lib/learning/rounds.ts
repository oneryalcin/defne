export const DEFAULT_ROUND_MAX_RETRY_PASSES = 3;
export const DEFAULT_MISTAKE_DECAY_HOURS = 24;
export const DEFAULT_NEAR_REVIEW_SPACING = 6;

export type RoundLearningStep = "learn_cards" | "meaning_recognition" | "context_usage" | "spelling_production";
export type RoundStep = "meaning_recognition" | "context_usage";
export type LearnCardSupportMode = "full_support" | "active_recall_then_reveal";

export interface RoundStepAttempt {
  wordId: string;
  step: RoundStep;
  passNumber: number;
  isCorrect: boolean;
}

export interface RoundWordStepStatus {
  wordId: string;
  firstAttemptCorrect: boolean | null;
  eventuallyCorrect: boolean;
  mistakeCount: number;
  lastPassNumber: number;
  shouldRetry: boolean;
  shouldRevealAndMoveOn: boolean;
}

export interface RoundStepProgress {
  statuses: RoundWordStepStatus[];
  retryWordIds: string[];
  revealAndMoveOnWordIds: string[];
  canAdvanceStep: boolean;
}

export interface RoundStepQuestionCursor {
  wordId: string;
  step: RoundStep;
  passNumber: number;
  pendingWordIds: string[];
  attemptNumberForWordInStep: number;
  isRetryPass: boolean;
  remainingInPass: number;
}

export function learnCardSupportMode(viewCountBeforeThisView: number): LearnCardSupportMode {
  return viewCountBeforeThisView <= 0 ? "full_support" : "active_recall_then_reveal";
}

export function canUnlockMeaningStep(cardViewCounts: Record<string, number>, wordIds: string[], requiredViews = 2): boolean {
  return wordIds.length > 0 && wordIds.every((wordId) => (cardViewCounts[wordId] ?? 0) >= requiredViews);
}

export function mistakeRecencyWeight(hoursSinceMistake: number, decayHours = DEFAULT_MISTAKE_DECAY_HOURS): number {
  if (!Number.isFinite(hoursSinceMistake)) return 0;
  return Math.exp(-Math.max(0, hoursSinceMistake) / Math.max(1, decayHours));
}

export function shouldKeepNearReview(
  mistakeCount: number,
  eligibleQuestionsSinceLastMistake: number,
  spacing = DEFAULT_NEAR_REVIEW_SPACING
): boolean {
  return mistakeCount > 0 && eligibleQuestionsSinceLastMistake < spacing;
}

export function evaluateRoundStepProgress(
  wordIds: string[],
  step: RoundStep,
  attempts: RoundStepAttempt[],
  maxRetryPasses = DEFAULT_ROUND_MAX_RETRY_PASSES
): RoundStepProgress {
  const statuses = wordIds.map((wordId) => {
    const wordAttempts = attempts
      .filter((attempt) => attempt.wordId === wordId && attempt.step === step)
      .sort((a, b) => a.passNumber - b.passNumber);
    const firstAttempt = wordAttempts[0];
    const eventuallyCorrect = wordAttempts.some((attempt) => attempt.isCorrect);
    const mistakeCount = wordAttempts.filter((attempt) => !attempt.isCorrect).length;
    const lastPassNumber = wordAttempts.reduce((latest, attempt) => Math.max(latest, attempt.passNumber), 0);
    const shouldRevealAndMoveOn = !eventuallyCorrect && lastPassNumber >= maxRetryPasses;
    const shouldRetry = !eventuallyCorrect && !shouldRevealAndMoveOn;

    return {
      wordId,
      firstAttemptCorrect: firstAttempt ? firstAttempt.isCorrect : null,
      eventuallyCorrect,
      mistakeCount,
      lastPassNumber,
      shouldRetry,
      shouldRevealAndMoveOn
    };
  });

  const retryWordIds = statuses.filter((status) => status.shouldRetry).map((status) => status.wordId);
  const revealAndMoveOnWordIds = statuses
    .filter((status) => status.shouldRevealAndMoveOn)
    .map((status) => status.wordId);

  return {
    statuses,
    retryWordIds,
    revealAndMoveOnWordIds,
    canAdvanceStep: statuses.every((status) => status.eventuallyCorrect || status.shouldRevealAndMoveOn)
  };
}

export function nextRoundStepQuestion(
  wordIds: string[],
  step: RoundStep,
  attempts: RoundStepAttempt[],
  maxRetryPasses = DEFAULT_ROUND_MAX_RETRY_PASSES
): RoundStepQuestionCursor | null {
  const stepAttempts = attempts.filter((attempt) => attempt.step === step);

  for (let passNumber = 1; passNumber <= maxRetryPasses; passNumber += 1) {
    const pendingWordIds = wordIds.filter((wordId) => {
      const wordAttempts = stepAttempts.filter((attempt) => attempt.wordId === wordId);
      const alreadyCorrect = wordAttempts.some((attempt) => attempt.isCorrect);
      const alreadyRevealed = wordAttempts.some((attempt) => !attempt.isCorrect && attempt.passNumber >= maxRetryPasses);
      const alreadyTriedThisPass = wordAttempts.some((attempt) => attempt.passNumber === passNumber);

      return !alreadyCorrect && !alreadyRevealed && !alreadyTriedThisPass;
    });

    const wordId = pendingWordIds[0];
    if (!wordId) continue;

    const attemptNumberForWordInStep =
      stepAttempts.filter((attempt) => attempt.wordId === wordId).length + 1;

    return {
      wordId,
      step,
      passNumber,
      pendingWordIds,
      attemptNumberForWordInStep,
      isRetryPass: passNumber > 1,
      remainingInPass: pendingWordIds.length
    };
  }

  return null;
}
