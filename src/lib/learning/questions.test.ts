import { describe, expect, it } from "vitest";
import { assessAnswer, generateQuestion } from "./questions";
import type { LearnerWordState, PracticeWord } from "../types";

describe("question generation", () => {
  const words = [
    makeWord("reluctant", "not willing to do something", ["hesitant"], ["eager"], ["reticent"]),
    makeWord("abundant", "more than enough", ["plentiful"], ["scarce"], []),
    makeWord("vivid", "bright and clear", ["bright"], ["dull"], []),
    makeWord("timid", "shy or nervous", ["shy"], ["bold"], []),
    makeWord("remote", "far away from other places", ["distant"], ["near"], [])
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

  it("does not reveal the canonical answer before the final hint", () => {
    const definitionQuestion = generateQuestion("definition_choice", words[0], words);
    const synonymQuestion = generateQuestion("synonym_choice", words[0], words);
    const spellingQuestion = generateQuestion("type_from_memory", words[0], words);

    expect(definitionQuestion.canonicalAnswer).toBe("not willing to do something");
    expect(definitionQuestion.hints.slice(0, -1).join(" ").toLowerCase()).not.toContain("not willing to do something");
    expect(synonymQuestion.canonicalAnswer).toBe("hesitant");
    expect(synonymQuestion.hints.slice(0, -1).join(" ").toLowerCase()).not.toContain("hesitant");
    expect(spellingQuestion.canonicalAnswer).toBe("reluctant");
    expect(spellingQuestion.hints.slice(0, -1).join(" ").toLowerCase()).not.toContain("reluctant");
    expect(synonymQuestion.hints.at(-1)).toContain("hesitant");
    expect(spellingQuestion.hints.at(-1)).toContain("reluctant");
  });

  it("uses a blanked example for hidden-target hints", () => {
    const question = generateQuestion(
      "type_from_memory",
      {
        ...words[0],
        word: "hinder",
        normalizedWord: "hinder",
        example: "The heavy rain hindered their journey.",
        spellingNote: "hin + der"
      },
      words
    );

    expect(question.hints[0]).toContain("The heavy rain _____ their journey.");
    expect(question.hints[0].toLowerCase()).not.toContain("hinder");
    expect(question.hints.slice(0, -1).join(" ").toLowerCase()).not.toContain("hin + der");
  });

  it("prefers same-round words as multiple-choice distractors", () => {
    const question = generateQuestion("definition_choice", words[0], words, {
      preferredDistractorWordIds: [words[1].id, words[2].id, words[3].id]
    });

    expect(question.choices).toContain("more than enough");
    expect(question.choices).toContain("bright and clear");
    expect(question.choices).toContain("shy or nervous");
    expect(question.choices).not.toContain("far away from other places");
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
    learnerStateContentVersion: 1
  };
}
