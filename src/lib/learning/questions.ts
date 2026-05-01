import type { FailureType, PracticeWord, QuestionType } from "../types";
import { dimensionForQuestion } from "./mastery";

export type AnswerMode = "choice" | "text";

export interface PracticeQuestion {
  wordId: string;
  questionType: QuestionType;
  answerMode: AnswerMode;
  prompt: string;
  instruction: string;
  choices: string[];
  expectedAnswers: string[];
  canonicalAnswer: string;
  hints: string[];
  targetWord: string;
}

export interface AnswerAssessment {
  isCorrect: boolean;
  failureType: FailureType;
  normalizedSubmitted: string;
}

export function generateQuestion(questionType: QuestionType, target: PracticeWord, allWords: PracticeWord[]): PracticeQuestion {
  const distractors = stableDistractors(target, allWords);
  const definitionDistractors = distractors.map((word) => word.definition).filter(Boolean);
  const synonymDistractors = distractors.flatMap((word) => word.synonyms).filter(Boolean);
  const antonymDistractors = distractors.flatMap((word) => word.antonyms).filter(Boolean);
  const wordDistractors = distractors.map((word) => word.word);

  switch (questionType) {
    case "definition_choice":
      return choiceQuestion(
        target,
        questionType,
        `What does "${target.word}" mean?`,
        "Choose the closest meaning.",
        target.definition,
        definitionDistractors
      );
    case "synonym_choice":
      return choiceQuestion(
        target,
        questionType,
        `Which word is closest in meaning to "${target.word}"?`,
        "Choose the best near-synonym.",
        target.synonyms[0] ?? target.definition,
        [...synonymDistractors, ...target.antonyms]
      );
    case "antonym_choice":
      return choiceQuestion(
        target,
        questionType,
        `Which word is most opposite to "${target.word}"?`,
        "Choose the best opposite or contrast.",
        target.antonyms[0] ?? `not ${target.word}`,
        [...antonymDistractors, ...target.synonyms]
      );
    case "sentence_usage_choice":
      return choiceQuestion(
        target,
        questionType,
        `Which sentence uses "${target.word}" correctly?`,
        "Look for the sentence where the word fits the meaning.",
        target.example,
        distractors.map((word) => replaceWordInSentence(word.example, word.word, target.word))
      );
    case "fill_sentence": {
      const sentence = sentenceWithBlank(target);
      return choiceQuestion(
        target,
        questionType,
        sentence,
        "Choose the word that completes the sentence.",
        target.word,
        [...wordDistractors, ...target.confusables]
      );
    }
    case "confusable_choice": {
      const choices = uniqueNormalised([target.word, ...target.confusables, ...wordDistractors]).slice(0, 4);
      return {
        wordId: target.id,
        questionType,
        answerMode: "choice",
        prompt: `Which word means: ${target.definition}?`,
        instruction: "Choose carefully between similar-looking or similar-sounding words.",
        choices: shuffleChoices(target.word, choices, target.id),
        expectedAnswers: [normaliseAnswer(target.word)],
        canonicalAnswer: target.word,
        hints: deterministicHints(target),
        targetWord: target.word
      };
    }
    case "spelling_choice": {
      const choices = spellingChoices(target);
      return {
        wordId: target.id,
        questionType,
        answerMode: "choice",
        prompt: `Which spelling is correct for the word meaning: ${target.definition}?`,
        instruction: "Choose the accurate spelling.",
        choices,
        expectedAnswers: [normaliseAnswer(target.word)],
        canonicalAnswer: target.word,
        hints: deterministicHints(target),
        targetWord: target.word
      };
    }
    case "type_from_memory":
      return {
        wordId: target.id,
        questionType,
        answerMode: "text",
        prompt: `Type the word that means: ${target.definition}`,
        instruction: "Spell the whole word from memory.",
        choices: [],
        expectedAnswers: [normaliseAnswer(target.word)],
        canonicalAnswer: target.word,
        hints: deterministicHints(target),
        targetWord: target.word
      };
  }
}

export function assessAnswer(question: PracticeQuestion, submittedAnswer: string): AnswerAssessment {
  const normalizedSubmitted = normaliseAnswer(submittedAnswer);
  const isCorrect = question.expectedAnswers.includes(normalizedSubmitted);
  if (isCorrect) {
    return { isCorrect, failureType: "none", normalizedSubmitted };
  }

  if (dimensionForQuestion(question.questionType) === "spelling") {
    return { isCorrect, failureType: "spelling_error", normalizedSubmitted };
  }

  if (question.questionType === "confusable_choice") {
    return { isCorrect, failureType: "confused_with_similar_word", normalizedSubmitted };
  }

  if (question.questionType === "type_from_memory" || normalizedSubmitted.length === 0) {
    return { isCorrect, failureType: "recognised_but_could_not_produce", normalizedSubmitted };
  }

  return { isCorrect, failureType: "meaning_unknown", normalizedSubmitted };
}

function choiceQuestion(
  target: PracticeWord,
  questionType: QuestionType,
  prompt: string,
  instruction: string,
  canonicalAnswer: string,
  distractors: string[]
): PracticeQuestion {
  const choices = shuffleChoices(canonicalAnswer, uniqueNormalised([canonicalAnswer, ...distractors]).slice(0, 4), target.id);
  return {
    wordId: target.id,
    questionType,
    answerMode: "choice",
    prompt,
    instruction,
    choices,
    expectedAnswers: [normaliseAnswer(canonicalAnswer)],
    canonicalAnswer,
    hints: deterministicHints(target),
    targetWord: target.word
  };
}

function deterministicHints(word: PracticeWord): string[] {
  const hints = [
    `It has a meaning close to: ${word.synonyms[0] ?? word.definition}.`,
    word.example,
    word.spellingNote ? `Spelling trap: ${word.spellingNote}` : `It begins with "${word.word.slice(0, 1)}".`,
    `Answer reveal: ${word.word}`
  ];
  return hints;
}

function stableDistractors(target: PracticeWord, allWords: PracticeWord[]): PracticeWord[] {
  return allWords
    .filter((word) => word.id !== target.id)
    .sort((a, b) => stableHash(`${target.id}:${a.id}`) - stableHash(`${target.id}:${b.id}`))
    .slice(0, 8);
}

function shuffleChoices(correctAnswer: string, choices: string[], seed: string): string[] {
  const unique = uniqueNormalised([correctAnswer, ...choices]);
  if (unique.length < 2) {
    return unique;
  }
  const [correct, ...rest] = unique;
  const sortedRest = rest.sort((a, b) => stableHash(`${seed}:${a}`) - stableHash(`${seed}:${b}`));
  const slot = stableHash(`${seed}:${correct}`) % Math.min(4, sortedRest.length + 1);
  const result = sortedRest.slice(0, 3);
  result.splice(slot, 0, correct);
  return result.slice(0, 4);
}

function spellingChoices(target: PracticeWord): string[] {
  const word = target.word;
  const variants = new Set<string>([word]);
  if (word.endsWith("ant")) variants.add(`${word.slice(0, -3)}ent`);
  if (word.endsWith("ent")) variants.add(`${word.slice(0, -3)}ant`);
  if (word.includes("ie")) variants.add(word.replace("ie", "ei"));
  if (word.includes("ei")) variants.add(word.replace("ei", "ie"));
  if (word.length > 5) variants.add(`${word.slice(0, -1)}`);
  if (word.length > 4) variants.add(`${word.slice(0, 2)}${word.slice(3)}`);
  variants.add(`${word}${word.slice(-1)}`);
  return shuffleChoices(word, [...variants], target.id);
}

function sentenceWithBlank(target: PracticeWord): string {
  const escaped = target.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "i");
  if (pattern.test(target.example)) {
    return target.example.replace(pattern, "_____");
  }
  return `A word meaning "${target.definition}" is _____.`;
}

function replaceWordInSentence(sentence: string, originalWord: string, replacement: string): string {
  const escaped = originalWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "i");
  if (pattern.test(sentence)) {
    return sentence.replace(pattern, replacement);
  }
  return sentence.replace(/\b[A-Za-z-]+\b/, replacement);
}

function uniqueNormalised(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    const key = normaliseAnswer(clean);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(clean);
  }
  return unique;
}

function normaliseAnswer(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
