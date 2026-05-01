import { describe, expect, it } from "vitest";
import { selectRoundWords } from "./roundSelection";
import type { LearnerWordState, PracticeWord } from "../types";

const NOW = "2026-05-01T12:00:00.000Z";

describe("round word selection", () => {
  it("adds one due mastered comeback and fills the other comeback slots with due stable words", () => {
    const selection = selectRoundWords(
      [
        ...coreWords(9),
        word("mastered_due", { masteryColour: "green", attemptCount: 6, correctCount: 6, lastSeenAt: daysAgo(6) }),
        word("stable_due_1", { masteryColour: "light_green", attemptCount: 3, correctCount: 3, lastSeenAt: daysAgo(2) }),
        word("stable_due_2", { masteryColour: "light_green", attemptCount: 3, correctCount: 3, lastSeenAt: daysAgo(1.5) }),
        word("stable_recent", { masteryColour: "light_green", attemptCount: 3, correctCount: 3, lastSeenAt: hoursAgo(12) }),
        word("mastered_recent", { masteryColour: "green", attemptCount: 6, correctCount: 6, lastSeenAt: daysAgo(2) })
      ],
      NOW,
      12,
      { revealAndMoveOnWordIds: [], eventuallyCorrectNotFirstAttemptWordIds: [] }
    );

    expect(selection.wordIds).toHaveLength(12);
    expect(selection.reasons.filter((reason) => reason.reason === "mastered_comeback").map((reason) => reason.word)).toEqual([
      "mastered_due"
    ]);
    expect(selection.reasons.filter((reason) => reason.reason === "stable_comeback").map((reason) => reason.word).sort()).toEqual([
      "stable_due_1",
      "stable_due_2"
    ]);
  });

  it("lets due stable words use all three comeback slots when no mastered word is due", () => {
    const selection = selectRoundWords(
      [
        ...coreWords(9),
        word("stable_due_1", { masteryColour: "light_green", attemptCount: 3, correctCount: 3, lastSeenAt: daysAgo(2) }),
        word("stable_due_2", { masteryColour: "light_green", attemptCount: 3, correctCount: 3, lastSeenAt: daysAgo(1.5) }),
        word("stable_due_3", { masteryColour: "light_green", attemptCount: 3, correctCount: 3, lastSeenAt: daysAgo(1.1) }),
        word("mastered_recent", { masteryColour: "green", attemptCount: 6, correctCount: 6, lastSeenAt: daysAgo(2) })
      ],
      NOW,
      12,
      { revealAndMoveOnWordIds: [], eventuallyCorrectNotFirstAttemptWordIds: [] }
    );

    expect(selection.wordIds).toHaveLength(12);
    expect(selection.reasons.some((reason) => reason.reason === "mastered_comeback")).toBe(false);
    expect(selection.reasons.filter((reason) => reason.reason === "stable_comeback")).toHaveLength(3);
  });

  it("does not keep a word in near-review after enough clean follow-up questions", () => {
    const selection = selectRoundWords(
      [
        word("recovered", {
          masteryColour: "yellow",
          nearReview: true,
          eligibleQuestionsSinceLastMistake: 4,
          attemptCount: 7,
          correctCount: 6,
          wrongCount: 1,
          lastSeenAt: hoursAgo(1),
          lastWrongAt: hoursAgo(2)
        }),
        word("active_repair", {
          masteryColour: "orange",
          nearReview: true,
          eligibleQuestionsSinceLastMistake: 2,
          attemptCount: 7,
          correctCount: 5,
          wrongCount: 2,
          lastSeenAt: hoursAgo(1),
          lastWrongAt: hoursAgo(2)
        }),
        ...coreWords(10)
      ],
      NOW,
      12,
      { revealAndMoveOnWordIds: [], eventuallyCorrectNotFirstAttemptWordIds: [] }
    );

    const recovered = selection.reasons.find((reason) => reason.word === "recovered");
    const activeRepair = selection.reasons.find((reason) => reason.word === "active_repair");

    expect(recovered?.reason).not.toBe("near_review");
    expect(activeRepair?.reason).toBe("near_review");
  });

  it("keeps recently seen stable and mastered words out of regular fallback slots", () => {
    const selection = selectRoundWords(
      [
        ...coreWords(12),
        word("stable_recent", {
          masteryColour: "light_green",
          attemptCount: 6,
          correctCount: 6,
          lastSeenAt: hoursAgo(3)
        }),
        word("mastered_recent", {
          masteryColour: "green",
          attemptCount: 8,
          correctCount: 8,
          stabilityDays: 10,
          lastSeenAt: daysAgo(2)
        })
      ],
      NOW,
      12,
      { revealAndMoveOnWordIds: [], eventuallyCorrectNotFirstAttemptWordIds: [] }
    );

    expect(selection.wordIds).not.toContain("word_stable_recent");
    expect(selection.wordIds).not.toContain("word_mastered_recent");
  });
});

function coreWords(count: number): PracticeWord[] {
  return Array.from({ length: count }, (_, index) =>
    word(`core_${index + 1}`, { masteryColour: "red", attemptCount: 0 })
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
    synonyms: [],
    antonyms: [],
    confusables: [],
    spellingNote: null,
    state: state(`word_${name}`, overrides)
  };
}

function state(wordId: string, overrides: Partial<LearnerWordState>): LearnerWordState {
  return {
    id: `state_${wordId}`,
    learnerId: "learner_1",
    wordId,
    meaningMastery: 0.9,
    usageMastery: 0.9,
    spellingMastery: 0.9,
    stabilityDays: 8,
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

function daysAgo(days: number): string {
  return new Date(Date.parse(NOW) - days * 86_400_000).toISOString();
}

function hoursAgo(hours: number): string {
  return new Date(Date.parse(NOW) - hours * 3_600_000).toISOString();
}
