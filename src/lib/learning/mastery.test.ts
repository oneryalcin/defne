import { describe, expect, it } from "vitest";
import {
  masteryColourForState,
  priorityScore,
  recallProbability,
  updateStateAfterAttempt
} from "./mastery";
import { scoreFromState } from "./scoring";
import type { AttemptRecord, LearnerWordState, PracticeWord } from "../types";

describe("mastery scoring", () => {
  it("uses exponential recall decay", () => {
    expect(recallProbability(3, 6)).toBeCloseTo(0.606, 2);
    expect(recallProbability(0, 6)).toBeCloseTo(1);
  });

  it("words never attempted stay red", () => {
    const state = makeState({ attemptCount: 0 });
    expect(masteryColourForState(state)).toBe("red");
  });

  it("first two clean attempts unlock reliable", () => {
    const state = makeState({
      attemptCount: 2,
      correctCount: 2,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 2,
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    expect(masteryColourForState(state)).toBe("light_green");
  });

  it("two correct but with hints does not unlock reliable", () => {
    const state = makeState({
      attemptCount: 2,
      correctCount: 2,
      wrongCount: 0,
      averageHintLevelUsed: 2,
      stabilityDays: 2,
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    expect(scoreFromState(state, null, "2026-05-02T08:00:00.000Z").colour).toBe("yellow");
  });

  it("mastered requires reliable proof, stability, and at least four corrects", () => {
    const onlyHigh = makeState({
      attemptCount: 2,
      correctCount: 2,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 2,
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    expect(masteryColourForState(onlyHigh)).toBe("light_green");

    const survived = makeState({
      attemptCount: 5,
      correctCount: 5,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 20,
      lastSeenAt: "2026-04-30T20:00:00.000Z"
    });
    expect(scoreFromState(survived, null, "2026-05-01T20:00:00.000Z").colour).toBe("green");
  });

  it("marks a long clean spaced streak as mastered even when it is due for refresh", () => {
    const state = makeState({
      attemptCount: 12,
      correctCount: 12,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 5.08,
      lastSeenAt: "2026-06-09T16:38:09.839Z",
      lastCorrectAt: "2026-06-09T16:38:09.839Z"
    });
    const attempts: AttemptRecord[] = [
      "2026-06-04T17:06:51.073Z",
      "2026-06-04T17:07:52.412Z",
      "2026-06-05T17:03:28.819Z",
      "2026-06-05T17:04:46.582Z",
      "2026-06-06T09:07:15.145Z",
      "2026-06-06T09:08:39.082Z",
      "2026-06-07T08:13:02.748Z",
      "2026-06-07T08:14:20.980Z",
      "2026-06-08T16:47:39.880Z",
      "2026-06-08T16:49:37.174Z",
      "2026-06-09T16:36:32.638Z",
      "2026-06-09T16:38:09.839Z"
    ].map((answeredAt) => ({ answeredAt, isCorrect: true, hintLevelUsed: 0 }));

    const breakdown = scoreFromState(state, attempts, "2026-06-17T12:00:00.000Z");

    expect(breakdown.colour).toBe("green");
    expect(breakdown.lowerBound).toBeGreaterThanOrEqual(0.9);
    expect(breakdown.recallEstimate).toBeLessThan(0.3);
    expect(breakdown.reasons.some((reason) => reason.includes("earned colour does not decay"))).toBe(true);
  });

  it("allows old mistakes to be outgrown into mastered", () => {
    const state = makeState({
      attemptCount: 28,
      correctCount: 26,
      wrongCount: 2,
      averageHintLevelUsed: 0,
      stabilityDays: 30.8,
      lastSeenAt: "2026-06-06T10:00:07.378Z",
      lastCorrectAt: "2026-06-06T10:00:07.378Z",
      lastWrongAt: "2026-05-24T09:00:00.000Z",
      nearReview: false,
      eligibleQuestionsSinceLastMistake: 20,
      recoveryDebt: 0
    });
    const attempts: AttemptRecord[] = [
      { answeredAt: "2026-05-18T09:00:00.000Z", isCorrect: false, hintLevelUsed: 0 },
      { answeredAt: "2026-05-24T09:00:00.000Z", isCorrect: false, hintLevelUsed: 0 },
      ...Array.from({ length: 26 }, (_, index) => ({
        answeredAt: new Date(Date.parse("2026-05-25T09:00:00.000Z") + index * 11 * 3_600_000).toISOString(),
        isCorrect: true,
        hintLevelUsed: 0
      }))
    ];

    const breakdown = scoreFromState(state, attempts, "2026-06-06T10:00:07.378Z");

    expect(breakdown.lowerBound).toBeGreaterThanOrEqual(0.8);
    expect(breakdown.colour).toBe("green");
    expect(breakdown.reasons.some((reason) => reason.includes("Old mistakes"))).toBe(true);
  });

  it("does not mark old mistakes mastered until recovery is cleared", () => {
    const state = makeState({
      attemptCount: 28,
      correctCount: 26,
      wrongCount: 2,
      averageHintLevelUsed: 0,
      stabilityDays: 30.8,
      lastSeenAt: "2026-06-06T10:00:07.378Z",
      lastCorrectAt: "2026-06-06T10:00:07.378Z",
      lastWrongAt: "2026-05-24T09:00:00.000Z",
      nearReview: true,
      eligibleQuestionsSinceLastMistake: 1,
      recoveryDebt: 1
    });

    const breakdown = scoreFromState(state, null, "2026-06-06T10:00:07.378Z");

    expect(breakdown.lowerBound).toBeGreaterThanOrEqual(0.8);
    expect(breakdown.colour).toBe("light_green");
    expect(breakdown.reasons.some((reason) => reason.includes("mistake recovery cleared"))).toBe(true);
  });

  it("keeps a strong-history word reliable after one fresh slip", () => {
    const state = makeState({
      attemptCount: 26,
      correctCount: 22,
      wrongCount: 4,
      averageHintLevelUsed: 0,
      stabilityDays: 18,
      lastSeenAt: "2026-06-06T10:00:00.000Z",
      lastCorrectAt: "2026-06-05T10:00:00.000Z",
      lastWrongAt: "2026-06-06T10:00:00.000Z",
      nearReview: true,
      eligibleQuestionsSinceLastMistake: 0,
      recoveryDebt: 2
    });

    const breakdown = scoreFromState(state, null, "2026-06-06T10:05:00.000Z");

    expect(breakdown.lowerBound).toBeGreaterThanOrEqual(0.7);
    expect(breakdown.colour).toBe("light_green");
    expect(breakdown.reasons.some((reason) => reason.includes("long record stays Reliable"))).toBe(true);
  });

  it("does not knock down a recent wrong after clean recovery proof", () => {
    const now = "2026-05-01T19:30:00.000Z";
    const state = makeState({
      attemptCount: 10,
      correctCount: 8,
      wrongCount: 2,
      lastSeenAt: "2026-05-01T19:10:38.557Z",
      lastCorrectAt: "2026-05-01T19:10:38.557Z",
      lastWrongAt: "2026-05-01T16:33:49.062Z",
      nearReview: false,
      eligibleQuestionsSinceLastMistake: 3
    });
    const attempts = [
      false,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      true,
      true
    ].map((isCorrect, index) => ({
      answeredAt: new Date(Date.parse("2026-05-01T16:32:44.875Z") + index * 1_000).toISOString(),
      isCorrect,
      hintLevelUsed: 0
    }));
    attempts[2] = {
      answeredAt: "2026-05-01T16:33:49.062Z",
      isCorrect: false,
      hintLevelUsed: 0
    };
    attempts[9] = {
      answeredAt: "2026-05-01T19:10:38.557Z",
      isCorrect: true,
      hintLevelUsed: 0
    };

    const recovered = scoreFromState(state, attempts, now);
    const unresolved = scoreFromState(
      {
        ...state,
        nearReview: true,
        eligibleQuestionsSinceLastMistake: 2
      },
      attempts,
      now
    );

    expect(recovered.colour).toBe("yellow");
    expect(recovered.reasons.some((reason) => reason.startsWith("Recent wrong still"))).toBe(false);
    expect(unresolved.colour).toBe("orange");
    expect(unresolved.reasons.some((reason) => reason.startsWith("Recent wrong still"))).toBe(true);
  });

  it("keeps old clean success reliable while treating it as refresh work", () => {
    const state = makeState({
      attemptCount: 4,
      correctCount: 4,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 2.37,
      lastSeenAt: "2026-05-09T09:25:09.853Z",
      lastCorrectAt: "2026-05-09T09:25:09.853Z"
    });
    const attempts: AttemptRecord[] = [
      { answeredAt: "2026-05-01T20:25:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T20:28:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-09T09:22:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-09T09:25:09.853Z", isCorrect: true, hintLevelUsed: 0 }
    ];

    const breakdown = scoreFromState(state, attempts, "2026-06-05T12:00:00.000Z");

    expect(breakdown.currentEffectiveN).toBeLessThan(0.3);
    expect(breakdown.colour).toBe("light_green");
    expect(breakdown.reasons.some((reason) => reason.includes("earned status"))).toBe(true);
  });

  it("does not mark one old slip in a strong history as red", () => {
    const state = makeState({
      attemptCount: 10,
      correctCount: 9,
      wrongCount: 1,
      averageHintLevelUsed: 0,
      stabilityDays: 2,
      lastSeenAt: "2026-05-09T09:25:09.853Z",
      lastCorrectAt: "2026-05-09T09:25:09.853Z",
      lastWrongAt: "2026-05-01T20:25:00.000Z",
      nearReview: false,
      eligibleQuestionsSinceLastMistake: 3
    });
    const attempts: AttemptRecord[] = Array.from({ length: 10 }, (_, index) => ({
      answeredAt: new Date(Date.parse("2026-05-01T20:25:00.000Z") + index * 86_400_000).toISOString(),
      isCorrect: index !== 0,
      hintLevelUsed: 0
    }));

    const breakdown = scoreFromState(state, attempts, "2026-06-05T12:00:00.000Z");

    expect(breakdown.colour).not.toBe("red");
    expect(breakdown.reasons.some((reason) => reason.includes("scheduler may queue"))).toBe(true);
  });

  it("keeps stale 80-percent histories reliable while treating them as refresh work", () => {
    const state = makeState({
      attemptCount: 24,
      correctCount: 20,
      wrongCount: 4,
      masteryColour: "yellow",
      averageHintLevelUsed: 0,
      stabilityDays: 3,
      lastSeenAt: "2026-05-05T18:52:48.393Z",
      lastCorrectAt: "2026-05-05T18:52:48.393Z",
      lastWrongAt: "2026-05-04T18:48:45.761Z",
      nearReview: false,
      eligibleQuestionsSinceLastMistake: 5,
      recoveryDebt: 0
    });
    const attempts: AttemptRecord[] = [
      ...Array.from({ length: 4 }, (_, index) => ({
        answeredAt: new Date(Date.parse("2026-05-04T18:48:45.761Z") + index * 30 * 60_000).toISOString(),
        isCorrect: false,
        hintLevelUsed: 0
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        answeredAt: new Date(Date.parse("2026-05-05T18:52:48.393Z") + index * 6 * 60 * 60_000).toISOString(),
        isCorrect: true,
        hintLevelUsed: 0
      }))
    ];

    const breakdown = scoreFromState(state, attempts, "2026-06-10T12:00:00.000Z");

    expect(breakdown.colour).toBe("light_green");
    expect(breakdown.reasons.some((reason) => reason.includes("scheduler may queue"))).toBe(true);
  });

  it("keeps stale earned reliable words reliable instead of turning them red", () => {
    const state = makeState({
      attemptCount: 24,
      correctCount: 20,
      wrongCount: 4,
      masteryColour: "light_green",
      averageHintLevelUsed: 0,
      stabilityDays: 4.42,
      lastSeenAt: "2026-05-15T17:59:55.934Z",
      lastCorrectAt: "2026-05-15T17:59:55.934Z",
      lastWrongAt: "2026-05-06T15:37:24.645Z",
      nearReview: false,
      eligibleQuestionsSinceLastMistake: 10,
      recoveryDebt: 0
    });
    const attempts: AttemptRecord[] = [
      ...Array.from({ length: 4 }, (_, index) => ({
        answeredAt: new Date(Date.parse("2026-05-04T10:23:12.652Z") + index * 30 * 60_000).toISOString(),
        isCorrect: false,
        hintLevelUsed: 0
      })),
      ...Array.from({ length: 20 }, (_, index) => ({
        answeredAt: new Date(Date.parse("2026-05-05T16:19:24.419Z") + index * 12 * 60 * 60_000).toISOString(),
        isCorrect: true,
        hintLevelUsed: 0
      }))
    ];

    const breakdown = scoreFromState(state, attempts, "2026-06-10T12:00:00.000Z");

    expect(breakdown.colour).toBe("light_green");
    expect(breakdown.lowerBound).toBeGreaterThanOrEqual(0.7);
    expect(breakdown.reasons.some((reason) => reason.includes("scheduler may queue"))).toBe(true);
  });

  it("uses attempt history to clear stale near-review state after three clean follow-ups", () => {
    const now = "2026-05-01T22:50:00.000Z";
    const state = makeState({
      attemptCount: 10,
      correctCount: 6,
      wrongCount: 4,
      lastSeenAt: "2026-05-01T21:47:42.512Z",
      lastCorrectAt: "2026-05-01T21:47:42.512Z",
      lastWrongAt: "2026-05-01T21:45:07.758Z",
      nearReview: true,
      eligibleQuestionsSinceLastMistake: 2
    });
    const attempts: AttemptRecord[] = [
      { answeredAt: "2026-05-01T20:48:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T20:54:00.000Z", isCorrect: false, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:35:00.000Z", isCorrect: false, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:39:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:40:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:42:00.000Z", isCorrect: false, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:45:07.758Z", isCorrect: false, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:46:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:47:00.000Z", isCorrect: true, hintLevelUsed: 0 },
      { answeredAt: "2026-05-01T21:47:42.512Z", isCorrect: true, hintLevelUsed: 0 }
    ];

    const breakdown = scoreFromState(state, attempts, now);

    expect(breakdown.reasons.some((reason) => reason.startsWith("Recent wrong still"))).toBe(false);
  });

  it("increments clean follow-up count and clears near review on the third correct answer", () => {
    const base = makeState({
      nearReview: true,
      eligibleQuestionsSinceLastMistake: 2,
      lastWrongAt: "2026-05-01T10:00:00.000Z",
      attemptCount: 5,
      correctCount: 3,
      wrongCount: 2
    });

    const result = updateStateAfterAttempt(base, {
      questionType: "fill_sentence",
      isCorrect: true,
      hintLevelUsed: 0,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });

    expect(result.eligibleQuestionsSinceLastMistake).toBe(3);
    expect(result.nearReview).toBe(false);
  });

  it("does not lower earned colour after a correct answer", () => {
    const base = makeState({
      masteryColour: "green",
      attemptCount: 12,
      correctCount: 12,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      stabilityDays: 5,
      lastSeenAt: "2026-05-01T10:00:00.000Z"
    });

    const result = updateStateAfterAttempt(base, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 4,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-06-01T10:00:00.000Z"
    });

    expect(result.masteryColour).toBe("green");
  });

  it("updates aggregate evidence without maintaining legacy dimension scores", () => {
    const base = makeState({
      lastSeenAt: "2026-04-30T12:00:00.000Z",
      attemptCount: 2,
      correctCount: 1,
      wrongCount: 1,
      averageHintLevelUsed: 0
    });

    const result = updateStateAfterAttempt(base, {
      questionType: "definition_choice",
      isCorrect: true,
      hintLevelUsed: 2,
      maxHintLevelAvailable: 4,
      responseTimeMs: 4000,
      failureType: "none",
      answeredAt: "2026-05-01T12:00:00.000Z"
    });

    expect(result.attemptCount).toBe(3);
    expect(result.correctCount).toBe(2);
    expect(result.averageHintLevelUsed).toBeCloseTo(2 / 3);
    expect(result.stabilityDays).toBeGreaterThan(base.stabilityDays);
  });

  it("ranks recently failed words above stable green words", () => {
    const now = "2026-05-01T12:00:00.000Z";
    const failed = makeWord("reluctant", {
      attemptCount: 3,
      wrongCount: 2,
      lastWrongAt: "2026-05-01T08:00:00.000Z",
      lastSeenAt: "2026-05-01T08:00:00.000Z"
    });
    const stable = makeWord("vivid", {
      masteryColour: "green",
      stabilityDays: 20,
      correctCount: 6,
      attemptCount: 6,
      wrongCount: 0,
      averageHintLevelUsed: 0,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });

    expect(priorityScore(failed, now)).toBeGreaterThan(priorityScore(stable, now));
  });

  it("untouched words have lower priority than struggling ones", () => {
    const now = "2026-05-01T12:00:00.000Z";
    const fresh = makeWord("nascent", { attemptCount: 0 });
    const struggling = makeWord("modest", {
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
      attemptCount: 3,
      wrongCount: 1,
      lastSeenAt: "2026-04-30T12:00:00.000Z"
    });
    const mastered = makeWord("vivid", {
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
    examples: [`A sentence with ${word}.`],
    synonyms: [`${word} synonym`],
    antonyms: [`not ${word}`],
    confusables: [],
    state: makeState(overrides)
  };
}

function makeState(overrides: Partial<LearnerWordState> = {}): LearnerWordState {
  return {
    id: "state_1",
    learnerId: "learner_1",
    wordId: "word_1",
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
