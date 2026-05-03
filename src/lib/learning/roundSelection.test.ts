import { describe, expect, it } from "vitest";
import { computeFeatures, selectRoundWords } from "./roundSelection";
import type { LearnerWordState, PracticeWord } from "../types";

const NOW = "2026-05-01T12:00:00.000Z";
const EMPTY_REMEDIATION = { revealAndMoveOnWordIds: [], eventuallyCorrectNotFirstAttemptWordIds: [] };

describe("round word selection v2.1", () => {
  it("uses fresh recovery debt as recovery score and lets old debt fall back to normal weakness", () => {
    const fresh = word("fresh_recovery", {
      attemptCount: 4,
      wrongCount: 2,
      recoveryDebt: 3,
      lastWrongAt: hoursAgo(4),
      lastPracticedAt: hoursAgo(4),
      lastExposedAt: hoursAgo(4)
    });
    const old = word("old_recovery", {
      attemptCount: 4,
      wrongCount: 2,
      recoveryDebt: 3,
      lastWrongAt: daysAgo(30),
      lastPracticedAt: daysAgo(30),
      lastExposedAt: daysAgo(30)
    });

    expect(computeFeatures(fresh, NOW).recovery).toBe(1);
    expect(computeFeatures(old, NOW).recovery).toBe(0);

    const selection = selectRoundWords([fresh, old, ...retrievalWords(10)], NOW, 12, EMPTY_REMEDIATION);
    expect(selection.reasons.find((reason) => reason.word === "fresh_recovery")?.reason).toBe("mistake_recovery");
  });

  it("caps untouched and introduced-only words together when enough retrieval candidates exist", () => {
    const introductions = [
      word("untouched_1"),
      word("untouched_2"),
      word("untouched_3"),
      word("introduced_1", { lastExposedAt: daysAgo(2) }),
      word("introduced_2", { lastExposedAt: daysAgo(3) }),
      word("introduced_3", { lastExposedAt: daysAgo(4) })
    ];
    const selection = selectRoundWords([...introductions, ...retrievalWords(12)], NOW, 12, EMPTY_REMEDIATION);
    const introCount = selection.wordIds.filter((id) => id.includes("untouched") || id.includes("introduced")).length;

    expect(introCount).toBeLessThanOrEqual(3);
  });

  it("relaxes the green cap when the available deck is all mastered words", () => {
    const selection = selectRoundWords(
      Array.from({ length: 8 }, (_, index) =>
        word(`green_${index + 1}`, {
          masteryColour: "green",
          attemptCount: 6,
          correctCount: 6,
          wrongCount: 0,
          stabilityDays: 10,
          lastCleanRetrievalAt: daysAgo(12),
          lastPracticedAt: daysAgo(12),
          lastExposedAt: daysAgo(12)
        })
      ),
      NOW,
      6,
      EMPTY_REMEDIATION
    );

    expect(selection.wordIds).toHaveLength(6);
    expect(selection.wordIds.every((id) => id.includes("green"))).toBe(true);
  });

  it("caps very-low-recall words before relaxing into relearning candidates", () => {
    const veryHard = Array.from({ length: 6 }, (_, index) =>
      word(`hard_${index + 1}`, {
        attemptCount: 3,
        wrongCount: 2,
        lastWrongAt: daysAgo(8),
        lastPracticedAt: daysAgo(8),
        lastExposedAt: daysAgo(8),
        recoveryDebt: 0
      })
    );
    const selection = selectRoundWords([...veryHard, ...retrievalWords(12)], NOW, 12, EMPTY_REMEDIATION);
    const relearningCount = selection.reasons.filter((reason) => reason.reason === "needs_relearning").length;

    expect(relearningCount).toBeLessThanOrEqual(2);
  });

  it("does not repeat recently introduced-only words unless the deck needs emergency backfill", () => {
    const recentIntroductions = Array.from({ length: 5 }, (_, index) =>
      word(`recent_intro_${index + 1}`, { lastExposedAt: hoursAgo(0.5), lastPracticedAt: hoursAgo(0.5) })
    );
    const selection = selectRoundWords([...recentIntroductions, ...retrievalWords(12)], NOW, 12, EMPTY_REMEDIATION);

    expect(selection.wordIds.some((id) => id.includes("recent_intro"))).toBe(false);
  });
});

function retrievalWords(count: number): PracticeWord[] {
  return Array.from({ length: count }, (_, index) =>
    word(`retrieval_${index + 1}`, {
      masteryColour: "yellow",
      attemptCount: 3,
      correctCount: 2,
      wrongCount: 1,
      stabilityDays: 2,
      lastCleanRetrievalAt: daysAgo(1),
      lastPracticedAt: daysAgo(1),
      lastExposedAt: daysAgo(1)
    })
  );
}

function word(name: string, overrides: Partial<LearnerWordState> = {}): PracticeWord {
  return {
    id: `word_${name}`,
    word: name,
    normalizedWord: name,
    difficultyLevel: 2,
    definition: `${name} definition`,
    example: `${name} example`,
    examples: [`${name} example`],
    synonyms: [],
    antonyms: [],
    confusables: [],
    state: state(`word_${name}`, overrides)
  };
}

function state(wordId: string, overrides: Partial<LearnerWordState>): LearnerWordState {
  return {
    id: `state_${wordId}`,
    learnerId: "learner_1",
    wordId,
    stabilityDays: 2,
    masteryColour: "red",
    lastSeenAt: null,
    lastCorrectAt: null,
    lastWrongAt: null,
    nextReviewAt: null,
    attemptCount: 0,
    correctCount: 0,
    wrongCount: 0,
    lastHintLevelUsed: null,
    averageHintLevelUsed: 0,
    averageResponseTimeMs: 0,
    failureTypes: [],
    confusedWithWordIds: [],
    nearReview: false,
    eligibleQuestionsSinceLastMistake: 0,
    recoveryDebt: 0,
    lastPracticedAt: null,
    lastCleanRetrievalAt: null,
    lastSupportedSuccessAt: null,
    lastRevealedAt: null,
    lastExposedAt: null,
    lastPracticedSessionId: null,
    lastPracticedInteractionIndex: null,
    learnerStateContentVersion: 1,
    ...overrides
  };
}

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();
}
