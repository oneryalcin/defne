export const masteryColours = ["red", "orange", "yellow", "light_green", "green"] as const;

export type MasteryColour = (typeof masteryColours)[number];

export const questionTypes = [
  "definition_choice",
  "synonym_choice",
  "antonym_choice",
  "sentence_usage_choice",
  "fill_sentence",
  "confusable_choice",
  "spelling_choice",
  "type_from_memory"
] as const;

export type QuestionType = (typeof questionTypes)[number];

export type FailureType =
  | "none"
  | "meaning_unknown"
  | "confused_with_similar_word"
  | "spelling_error"
  | "recognised_but_could_not_produce"
  | "too_slow"
  | "guessed"
  | "forgot_after_delay";

export type MasteryDimension = "meaning" | "usage" | "spelling";

export interface LearnerWordState {
  id: string;
  learnerId: string;
  wordId: string;
  meaningMastery: number;
  usageMastery: number;
  spellingMastery: number;
  stabilityDays: number;
  masteryColour: MasteryColour;
  lastSeenAt: string | null;
  lastCorrectAt: string | null;
  lastWrongAt: string | null;
  nextReviewAt: string | null;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  lastHintLevelUsed: number | null;
  averageHintLevelUsed: number;
  averageResponseTimeMs: number;
  failureTypes: FailureType[];
  confusedWithWordIds: string[];
}

export interface PracticeWord {
  id: string;
  word: string;
  normalizedWord: string;
  difficultyLevel: number;
  definition: string;
  example: string;
  synonyms: string[];
  antonyms: string[];
  confusables: string[];
  spellingNote: string | null;
  state: LearnerWordState;
}

export interface PracticeAttemptOutcome {
  questionType: QuestionType;
  isCorrect: boolean;
  hintLevelUsed: number;
  maxHintLevelAvailable: number;
  responseTimeMs: number;
  failureType: FailureType;
  answeredAt: string;
}

export interface SessionPlanItem {
  wordId: string;
  questionType: QuestionType;
}

export interface SessionSummary {
  plan?: SessionPlanItem[];
  wordsImproved?: string[];
  spellingTraps?: string[];
  revisitTomorrow?: string[];
  completedAt?: string;
}
