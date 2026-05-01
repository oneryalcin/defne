import { describe, expect, it } from "vitest";
import {
  canUnlockMeaningStep,
  evaluateRoundStepProgress,
  learnCardSupportMode,
  mistakeRecencyWeight,
  nextRoundStepQuestion,
  shouldKeepNearReview
} from "./rounds";

describe("round-based vocabulary mode", () => {
  it("uses the second card view for active recall before reveal", () => {
    expect(learnCardSupportMode(0)).toBe("full_support");
    expect(learnCardSupportMode(1)).toBe("active_recall_then_reveal");
  });

  it("unlocks meaning recognition only after every card has two views", () => {
    expect(canUnlockMeaningStep({ cautious: 2, fragile: 2 }, ["cautious", "fragile"])).toBe(true);
    expect(canUnlockMeaningStep({ cautious: 2, fragile: 1 }, ["cautious", "fragile"])).toBe(false);
  });

  it("separates first-attempt correctness from eventual correctness", () => {
    const progress = evaluateRoundStepProgress(
      ["reluctant"],
      "meaning_recognition",
      [
        { wordId: "reluctant", step: "meaning_recognition", passNumber: 1, isCorrect: false },
        { wordId: "reluctant", step: "meaning_recognition", passNumber: 2, isCorrect: true }
      ]
    );

    expect(progress.canAdvanceStep).toBe(true);
    expect(progress.statuses[0]).toMatchObject({
      firstAttemptCorrect: false,
      eventuallyCorrect: true,
      mistakeCount: 1,
      shouldRetry: false,
      shouldRevealAndMoveOn: false
    });
  });

  it("asks all words once, then retries only missed words", () => {
    const firstQuestion = nextRoundStepQuestion(["cautious", "fragile"], "meaning_recognition", []);
    expect(firstQuestion).toMatchObject({
      wordId: "cautious",
      passNumber: 1,
      attemptNumberForWordInStep: 1,
      isRetryPass: false
    });

    const retryQuestion = nextRoundStepQuestion(
      ["cautious", "fragile"],
      "meaning_recognition",
      [
        { wordId: "cautious", step: "meaning_recognition", passNumber: 1, isCorrect: false },
        { wordId: "fragile", step: "meaning_recognition", passNumber: 1, isCorrect: true }
      ]
    );

    expect(retryQuestion).toMatchObject({
      wordId: "cautious",
      passNumber: 2,
      pendingWordIds: ["cautious"],
      attemptNumberForWordInStep: 2,
      isRetryPass: true
    });
  });

  it("reveals and moves on after the retry cap instead of looping forever", () => {
    const progress = evaluateRoundStepProgress(
      ["cautious"],
      "context_usage",
      [
        { wordId: "cautious", step: "context_usage", passNumber: 1, isCorrect: false },
        { wordId: "cautious", step: "context_usage", passNumber: 2, isCorrect: false },
        { wordId: "cautious", step: "context_usage", passNumber: 3, isCorrect: false }
      ]
    );

    expect(progress.canAdvanceStep).toBe(true);
    expect(progress.retryWordIds).toEqual([]);
    expect(progress.revealAndMoveOnWordIds).toEqual(["cautious"]);
    expect(progress.statuses[0]?.eventuallyCorrect).toBe(false);
  });

  it("keeps recent mistakes in near review until enough eligible spacing has passed", () => {
    expect(shouldKeepNearReview(1, 2)).toBe(true);
    expect(shouldKeepNearReview(1, 3)).toBe(false);
    expect(shouldKeepNearReview(0, 0)).toBe(false);
  });

  it("uses the documented exponential mistake recency weight", () => {
    expect(mistakeRecencyWeight(0)).toBeCloseTo(1);
    expect(mistakeRecencyWeight(24)).toBeCloseTo(Math.exp(-1));
  });
});
