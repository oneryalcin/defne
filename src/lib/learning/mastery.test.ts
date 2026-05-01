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

  it("ignores spelling when judging colour", () => {
    const state = makeState({
      meaningMastery: 0.95,
      usageMastery: 0.95,
      spellingMastery: 0.0,
      stabilityDays: 8,
      correctCount: 5,
      attemptCount: 5,
      wrongCount: 0,
      averageHintLevelUsed: 0
    });
    expect(masteryColourForState(state)).toBe("green");
  });

  it("words never attempted stay red", () => {
    const state = makeState({ attemptCount: 0 });
    expect(masteryColourForState(state)).toBe("red");
  });

  it("first two clean attempts unlock reliable", () => {
    const state = makeState({
      meaningMastery: 0.82,
      usageMastery: 0.8,
      attemptCount: 2,
      correctCount: 2,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 2
    });
    expect(masteryColourForState(state)).toBe("light_green");
  });

  it("two correct but with hints does not unlock reliable", () => {
    const state = makeState({
      meaningMastery: 0.82,
      usageMastery: 0.8,
      attemptCount: 2,
      correctCount: 2,
      wrongCount: 0,
      averageHintLevelUsed: 2,
      stabilityDays: 2
    });
    expect(masteryColourForState(state)).toBe("yellow");
  });

  it("mastered requires high score AND survived decay", () => {
    const onlyHigh = makeState({
      meaningMastery: 0.92,
      usageMastery: 0.9,
      attemptCount: 2,
      correctCount: 2,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 2
    });
    expect(masteryColourForState(onlyHigh)).toBe("light_green");

    const survived = makeState({
      meaningMastery: 0.92,
      usageMastery: 0.9,
      attemptCount: 5,
      correctCount: 5,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 8
    });
    expect(masteryColourForState(survived)).toBe("green");
  });

  it("ranks recently failed weak words above stable green words", () => {
    const now = "2026-05-01T12:00:00.000Z";
    const failed = makeWord("reluctant", {
      meaningMastery: 0.25,
      usageMastery: 0.3,
      attemptCount: 3,
      wrongCount: 2,
      lastWrongAt: "2026-05-01T08:00:00.000Z",
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    const stable = makeWord("vivid", {
      meaningMastery: 0.95,
      usageMastery: 0.95,
      masteryColour: "green",
      stabilityDays: 20,
      correctCount: 6,
      attemptCount: 6,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });

    expect(priorityScore(failed, now)).toBeGreaterThan(priorityScore(stable, now));
    expect(selectSessionPlan([stable, failed], now, 1)[0]?.wordId).toBe(failed.id);
  });

  it("rewards heavy-hint correct answers less than unassisted correct answers", () => {
    const base = makeState({
      meaningMastery: 0.4,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });
    const unassisted = updateStateAfterAttempt(base, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 0,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });
    const hinted = updateStateAfterAttempt(base, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 3,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });

    expect(unassisted.meaningMastery).toBeGreaterThan(hinted.meaningMastery);
  });

  it("response time is not a factor — fast and slow correct answers score the same", () => {
    const base = makeState({
      meaningMastery: 0.4,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });
    const fast = updateStateAfterAttempt(base, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 0,
      maxHintLevelAvailable: 4,
      responseTimeMs: 2000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });
    const slow = updateStateAfterAttempt(base, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 0,
      maxHintLevelAvailable: 4,
      responseTimeMs: 35000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });
    expect(fast.meaningMastery).toBeCloseTo(slow.meaningMastery, 6);
  });

  it("delay since last seen still rewards retention", () => {
    const sameDay = makeState({
      meaningMastery: 0.4,
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    const overnight = makeState({
      meaningMastery: 0.4,
      lastSeenAt: "2026-04-30T08:00:00.000Z"
    });
    const sameDayResult = updateStateAfterAttempt(sameDay, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 0,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });
    const overnightResult = updateStateAfterAttempt(overnight, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 0,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });
    expect(overnightResult.meaningMastery).toBeGreaterThan(sameDayResult.meaningMastery);
  });

  it("untouched words have lower priority than struggling ones", () => {
    const now = "2026-05-01T12:00:00.000Z";
    const fresh = makeWord("nascent", { attemptCount: 0 });
    const struggling = makeWord("modest", {
      meaningMastery: 0.2,
      usageMastery: 0.25,
      attemptCount: 2,
      wrongCount: 1,
      lastWrongAt: "2026-05-01T08:00:00.000Z",
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    expect(priorityScore(struggling, now)).toBeGreaterThan(priorityScore(fresh, now));
  });

  it("mastered words have very low priority", () => {
    const now = "2026-05-01T12:00:00.000Z";
    const struggling = makeWord("modest", {
      meaningMastery: 0.4,
      usageMastery: 0.5,
      attemptCount: 3,
      wrongCount: 1,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });
    const mastered = makeWord("vivid", {
      meaningMastery: 0.95,
      usageMastery: 0.95,
      masteryColour: "green",
      stabilityDays: 20,
      correctCount: 6,
      attemptCount: 6,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });
    expect(priorityScore(mastered, now)).toBeLessThan(priorityScore(struggling, now));
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
