import { describe, expect, it } from "vitest";
import { assessAnswer, generateQuestion } from "./questions";
import type { LearnerWordState, PracticeWord } from "../types";

describe("question generation", () => {
  const words = [
    makeWord("reluctant", "not willing to do something", ["hesitant"], ["eager"], ["reticent"]),
    makeWord("abundant", "more than enough", ["plentiful"], ["scarce"], []),
    makeWord("vivid", "bright and clear", ["bright"], ["dull"], []),
    makeWord("timid", "shy or nervous", ["shy"], ["bold"], [])
  ];

  it("creates deterministic definition questions with one expected answer", () => {
    const first = generateQuestion("definition_choice", words[0], words);
    const second = generateQuestion("definition_choice", words[0], words);

    expect(first).toEqual(second);
    expect(first.expectedAnswers).toEqual(["not willing to do something"]);
    expect(new Set(first.choices.map((choice) => choice.toLowerCase())).size).toBe(first.choices.length);
  });

  it("checks spelling case-insensitively while preserving canonical feedback", () => {
    const question = generateQuestion("type_from_memory", words[0], words);
    expect(assessAnswer(question, "  RELUCTANT ")).toMatchObject({ isCorrect: true, failureType: "none" });
    expect(question.canonicalAnswer).toBe("reluctant");
  });

  it("diagnoses confusable-choice mistakes separately from unknown meaning", () => {
    const question = generateQuestion("confusable_choice", words[0], words);
    const result = assessAnswer(question, "reticent");
    expect(result.isCorrect).toBe(false);
    expect(result.failureType).toBe("confused_with_similar_word");
  });

  it("includes the canonical spelling among spelling-choice options", () => {
    const question = generateQuestion("spelling_choice", words[0], words);
    expect(question.choices).toContain("reluctant");
  });
});

function makeWord(
  word: string,
  definition: string,
  synonyms: string[],
  antonyms: string[],
  confusables: string[]
): PracticeWord {
  return {
    id: `word_${word}`,
    word,
    normalizedWord: word,
    difficultyLevel: 2,
    definition,
    example: `Maya used ${word} in a careful sentence.`,
    synonyms,
    antonyms,
    confusables,
    spellingNote: "watch the ending",
    state: makeState(`word_${word}`)
  };
}

function makeState(wordId: string): LearnerWordState {
  return {
    id: `state_${wordId}`,
    learnerId: "learner_1",
    wordId,
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
    confusedWithWordIds: []
  };
}
