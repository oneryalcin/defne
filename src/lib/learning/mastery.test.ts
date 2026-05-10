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
