import { describe, expect, it } from "vitest";
import {
  masteryColourForState,
  priorityScore,
  recallProbability,
  selectSessionPlan,
  updateStateAfterAttempt
} from "./mastery";
import type { LearnerWordState, PracticeWord } from "../types";

describe("mastery scoring", () => {
  it("uses exponential recall decay", () => {
    expect(recallProbability(3, 6)).toBeCloseTo(0.606, 2);
    expect(recallProbability(0, 6)).toBeCloseTo(1);
  });

  it("blocks green when spelling is weak", () => {
    const state = makeState({
      meaningMastery: 0.95,
      usageMastery: 0.95,
      spellingMastery: 0.4,
      stabilityDays: 10,
      correctCount: 8
    });
    expect(masteryColourForState(state)).toBe("orange");
  });

  it("lets proven all-round mastery become green", () => {
    const state = makeState({
      meaningMastery: 0.95,
      usageMastery: 0.92,
      spellingMastery: 0.93,
      stabilityDays: 4,
      correctCount: 4
    });
    expect(masteryColourForState(state)).toBe("green");
  });

  it("ranks recently failed weak words above stable green words", () => {
    const now = "2026-05-01T12:00:00.000Z";
    const failed = makeWord("reluctant", {
      meaningMastery: 0.25,
      usageMastery: 0.3,
      spellingMastery: 0.2,
      lastWrongAt: "2026-05-01T08:00:00.000Z",
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    const stable = makeWord("vivid", {
      meaningMastery: 0.95,
      usageMastery: 0.95,
      spellingMastery: 0.95,
      masteryColour: "green",
      stabilityDays: 20,
      correctCount: 6,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });

    expect(priorityScore(failed, now)).toBeGreaterThan(priorityScore(stable, now));
    expect(selectSessionPlan([stable, failed], now, 1)[0]?.wordId).toBe(failed.id);
  });

  it("rewards heavy-hint correct answers less than unassisted correct answers", () => {
    const base = makeState({ spellingMastery: 0.4, lastSeenAt: "2026-04-30T12:00:00.000Z" });
    const unassisted = updateStateAfterAttempt(base, {
      questionType: "type_from_memory",
      isCorrect: true,
      hintLevelUsed: 0,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });
    const hinted = updateStateAfterAttempt(base, {
      questionType: "type_from_memory",
      isCorrect: true,
      hintLevelUsed: 3,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });

    expect(unassisted.spellingMastery).toBeGreaterThan(hinted.spellingMastery);
  });
});

function makeWord(word: string, overrides: Partial<LearnerWordState> = {}): PracticeWord {
  return {
    id: `word_${word}`,
    word,
    normalizedWord: word,
    difficultyLevel: 2,
    definition: `${word} definition`,
    example: `A sentence with ${word}.`,
    synonyms: [`${word} synonym`],
    antonyms: [`not ${word}`],
    confusables: [],
    spellingNote: "watch the middle letters",
    state: makeState(overrides)
  };
}

function makeState(overrides: Partial<LearnerWordState> = {}): LearnerWordState {
  return {
    id: "state_1",
    learnerId: "learner_1",
    wordId: "word_1",
    meaningMastery: 0,
    usageMastery: 0,
    spellingMastery: 0,
    stabilityDays: 1,
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
    ...overrides
  };
}
