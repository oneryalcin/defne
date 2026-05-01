import type { PracticeWord, RoundSelectionReason } from "../types";
import { priorityScore, selectSessionPlan } from "./mastery";
import { DEFAULT_NEAR_REVIEW_SPACING } from "./rounds";

const CORE_ROUND_WORD_COUNT = 9;
const COMEBACK_SLOT_COUNT = 3;
const MASTERED_COMEBACK_DAYS = 5;
const STABLE_COMEBACK_HOURS = 24;

export interface RoundRemediationEvidence {
  revealAndMoveOnWordIds: string[];
  eventuallyCorrectNotFirstAttemptWordIds: string[];
}

export interface RoundWordSelection {
  wordIds: string[];
  reasons: RoundSelectionReason[];
}

type ReasonTemplate = Omit<RoundSelectionReason, "wordId" | "word">;

const reasonTemplates = {
  nearReview: {
    reason: "near_review",
    label: "Needs a clean comeback",
    detail: "A recent mistake keeps this word in practice until it gets enough clean questions."
  },
  revealedRecently: {
    reason: "revealed_recently",
    label: "Answer was revealed recently",
    detail: "The retry cap was reached, so the word comes back soon without blocking the round."
  },
  recoveredAfterMiss: {
    reason: "recovered_after_miss",
    label: "Recovered after a miss",
    detail: "The word was completed, but not on the first attempt, so it needs another proof point."
  },
  newOrRed: {
    reason: "new_or_red",
    label: "New or still building",
    detail: "This word has little secure evidence yet."
  },
  dueReview: {
    reason: "due_review",
    label: "Scheduled review",
    detail: "Enough time has passed that recall should be checked again."
  },
  nearGreen: {
    reason: "near_green",
    label: "Almost secure",
    detail: "This word is close to strong mastery and needs one more clean proof."
  },
  masteredComeback: {
    reason: "mastered_comeback",
    label: "Mastered check",
    detail: "This mastered word has had enough space and gets a quick comeback check."
  },
  stableComeback: {
    reason: "stable_comeback",
    label: "Stable check",
    detail: "This stable word has had at least a day of spacing and gets a quick comeback check."
  },
  priority: {
    reason: "priority",
    label: "Good next practice",
    detail: "The scheduler picked this from weakness, spacing, and recent evidence."
  }
} as const satisfies Record<string, ReasonTemplate>;

export function selectRoundWords(
  words: PracticeWord[],
  nowIso: string,
  targetCount: number,
  remediation: RoundRemediationEvidence
): RoundWordSelection {
  const count = Math.max(6, Math.min(12, Math.round(targetCount)));
  const comebackSlots = Math.min(COMEBACK_SLOT_COUNT, Math.max(0, count - CORE_ROUND_WORD_COUNT));
  const coreCount = count - comebackSlots;
  const wordMap = new Map(words.map((word) => [word.id, word]));
  // Random tie-break is fine here — once the round is committed the
  // canonical word list lives in practice_rounds.word_ids_json and
  // getMissionPreview will reuse it instead of reselecting.
  const ranked = [...words].sort((a, b) => {
    const diff = priorityScore(b, nowIso) - priorityScore(a, nowIso);
    if (diff !== 0) return diff;
    return Math.random() - 0.5;
  });
  const coreRanked = ranked.filter((word) => !isProtectedComebackWord(word, nowIso));
  const picked = new Map<string, RoundSelectionReason>();

  pickWords(picked, ranked.filter((word) => isActiveNearReview(word)), coreCount, reasonTemplates.nearReview);
  pickWordIds(picked, wordMap, remediation.revealAndMoveOnWordIds, coreCount, reasonTemplates.revealedRecently);
  pickWordIds(
    picked,
    wordMap,
    remediation.eventuallyCorrectNotFirstAttemptWordIds,
    coreCount,
    reasonTemplates.recoveredAfterMiss
  );
  pickWords(picked, coreRanked.filter((word) => word.state.attemptCount === 0 || word.state.masteryColour === "red"), coreCount, reasonTemplates.newOrRed);
  pickWords(picked, coreRanked.filter((word) => isDueForReview(word, nowIso)), coreCount, reasonTemplates.dueReview);
  pickWords(picked, coreRanked.filter((word) => isNearGreenProofWord(word)), coreCount, reasonTemplates.nearGreen);
  pickWords(
    picked,
    selectSessionPlan(words, nowIso, coreCount)
      .map((item) => wordMap.get(item.wordId))
      .filter((word): word is PracticeWord => Boolean(word))
      .filter((word) => !isProtectedComebackWord(word, nowIso)),
    coreCount,
    reasonTemplates.priority
  );
  pickWords(picked, coreRanked, coreCount, reasonTemplates.priority);

  const dueMastered = ranked.filter((word) => isMasteredComebackDue(word, nowIso));
  const dueStable = ranked.filter((word) => isStableComebackDue(word, nowIso));
  const sizeBeforeComebacks = picked.size;

  if (comebackSlots > 0) {
    pickWords(picked, dueMastered, sizeBeforeComebacks + 1, reasonTemplates.masteredComeback);
    pickWords(picked, dueStable, sizeBeforeComebacks + comebackSlots, reasonTemplates.stableComeback);
  }

  pickWords(picked, coreRanked, count, reasonTemplates.priority);
  pickWords(picked, ranked, count, reasonTemplates.priority);

  return {
    wordIds: [...picked.keys()],
    reasons: [...picked.values()]
  };
}

function pickWordIds(
  picked: Map<string, RoundSelectionReason>,
  wordMap: Map<string, PracticeWord>,
  wordIds: string[],
  count: number,
  reason: ReasonTemplate
): void {
  for (const wordId of wordIds) {
    if (picked.size >= count) return;
    const word = wordMap.get(wordId);
    if (word) pickWord(picked, word, reason);
  }
}

function pickWords(
  picked: Map<string, RoundSelectionReason>,
  words: PracticeWord[],
  count: number,
  reason: ReasonTemplate
): void {
  for (const word of words) {
    if (picked.size >= count) return;
    pickWord(picked, word, reason);
  }
}

function pickWord(picked: Map<string, RoundSelectionReason>, word: PracticeWord, reason: ReasonTemplate): void {
  if (picked.has(word.id)) return;
  picked.set(word.id, {
    wordId: word.id,
    word: word.word,
    ...reason
  });
}

function isDueForReview(word: PracticeWord, nowIso: string): boolean {
  return word.state.nextReviewAt ? new Date(word.state.nextReviewAt).getTime() <= new Date(nowIso).getTime() : false;
}

function isActiveNearReview(word: PracticeWord): boolean {
  return (
    word.state.nearReview &&
    word.state.eligibleQuestionsSinceLastMistake < DEFAULT_NEAR_REVIEW_SPACING
  );
}

function isNearGreenProofWord(word: PracticeWord): boolean {
  const weakest = Math.min(word.state.meaningMastery, word.state.usageMastery, word.state.spellingMastery);
  return weakest >= 0.75 && weakest < 0.9;
}

function isMasteredComebackDue(word: PracticeWord, nowIso: string): boolean {
  return word.state.masteryColour === "green" && daysSinceLastSeen(word, nowIso) >= MASTERED_COMEBACK_DAYS;
}

function isStableComebackDue(word: PracticeWord, nowIso: string): boolean {
  return word.state.masteryColour === "light_green" && daysSinceLastSeen(word, nowIso) >= STABLE_COMEBACK_HOURS / 24;
}

function isProtectedComebackWord(word: PracticeWord, nowIso: string): boolean {
  if (isActiveNearReview(word)) return false;
  if (word.state.masteryColour === "green") return !isMasteredComebackDue(word, nowIso);
  if (word.state.masteryColour === "light_green") return !isStableComebackDue(word, nowIso);
  return false;
}

function daysSinceLastSeen(word: PracticeWord, nowIso: string): number {
  if (!word.state.lastSeenAt) return Number.POSITIVE_INFINITY;
  return (new Date(nowIso).getTime() - new Date(word.state.lastSeenAt).getTime()) / 86_400_000;
}
