import type { PracticeWord, RoundSelectionReason } from "../types";
import { priorityScore, selectSessionPlan } from "./mastery";

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
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const ranked = [...words].sort((a, b) => priorityScore(b, nowIso) - priorityScore(a, nowIso) || a.word.localeCompare(b.word));
  const picked = new Map<string, RoundSelectionReason>();

  pickWords(picked, ranked.filter((word) => word.state.nearReview), count, reasonTemplates.nearReview);
  pickWordIds(picked, wordMap, remediation.revealAndMoveOnWordIds, count, reasonTemplates.revealedRecently);
  pickWordIds(
    picked,
    wordMap,
    remediation.eventuallyCorrectNotFirstAttemptWordIds,
    count,
    reasonTemplates.recoveredAfterMiss
  );
  pickWords(picked, ranked.filter((word) => word.state.attemptCount === 0 || word.state.masteryColour === "red"), count, reasonTemplates.newOrRed);
  pickWords(picked, ranked.filter((word) => isDueForReview(word, nowIso)), count, reasonTemplates.dueReview);
  pickWords(picked, ranked.filter((word) => isNearGreenProofWord(word)), count, reasonTemplates.nearGreen);
  pickWords(
    picked,
    selectSessionPlan(words, nowIso, count)
      .map((item) => wordMap.get(item.wordId))
      .filter((word): word is PracticeWord => Boolean(word)),
    count,
    reasonTemplates.priority
  );
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

function isNearGreenProofWord(word: PracticeWord): boolean {
  const weakest = Math.min(word.state.meaningMastery, word.state.usageMastery, word.state.spellingMastery);
  return weakest >= 0.75 && weakest < 0.9;
}
