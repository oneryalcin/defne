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

export interface LearnerWordState {
  id: string;
  learnerId: string;
  wordId: string;
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
  nearReview: boolean;
  eligibleQuestionsSinceLastMistake: number;
  recoveryDebt: number;
  lastPracticedAt: string | null;
  lastCleanRetrievalAt: string | null;
  lastSupportedSuccessAt: string | null;
  lastRevealedAt: string | null;
  lastExposedAt: string | null;
  lastPracticedSessionId: string | null;
  lastPracticedInteractionIndex: number | null;
  learnerStateContentVersion: number;
}

export interface PracticeWord {
  id: string;
  word: string;
  normalizedWord: string;
  difficultyLevel: number;
  definition: string;
  example: string;
  examples: string[];
  exampleRefs?: Array<{
    id: string;
    sentence: string;
  }>;
  synonyms: string[];
  antonyms: string[];
  confusables: string[];
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
  masteryCredit?: "normal" | "recovery";
}

/** Minimal per-attempt record used for time-weighted mastery scoring. */
export interface AttemptRecord {
  answeredAt: string;
  isCorrect: boolean;
  hintLevelUsed: number;
}

export interface SessionPlanItem {
  wordId: string;
  questionType: QuestionType;
}

export type RoundSelectionReasonCode =
  | "mistake_recovery"
  | "new_word"
  | "needs_relearning"
  | "scheduled_review"
  | "stable_check"
  | "almost_secure"
  | "useful_practice"
  | "near_review"
  | "revealed_recently"
  | "recovered_after_miss"
  | "new_or_red"
  | "due_review"
  | "near_green"
  | "mastered_comeback"
  | "stable_comeback"
  | "priority";

export interface RoundSelectionReason {
  wordId: string;
  word: string;
  reason: RoundSelectionReasonCode;
  label: string;
  detail: string;
}

export interface RoundMistakeEvidence {
  word: string;
  meaningMistakes: number;
  contextMistakes: number;
  totalMistakes: number;
}

export interface SessionSummary {
  plan?: SessionPlanItem[];
  wordsImproved?: string[];
  revisitTomorrow?: string[];
  round?: {
    roundId: string;
    firstAttemptSecureWords: string[];
    eventuallyCorrectWords: string[];
    revealAndMoveOnWords: string[];
    nearReviewWords: string[];
    selectionReasons?: RoundSelectionReason[];
    mistakeEvidence?: RoundMistakeEvidence[];
    explanation: string;
  };
  completedAt?: string;
}
