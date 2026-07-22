import type { MasteryColour } from "../types";

export const spellingProgressStatuses = [
  "not_started",
  "needs_work",
  "practising",
  "spotted_once",
  "reliable",
  "steady"
] as const;

export type SpellingProgressStatus = (typeof spellingProgressStatuses)[number];

export type SpellingProgressCounts = {
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
};

export function spellingProgressStatus(word: SpellingProgressCounts): SpellingProgressStatus {
  if (word.attemptCount === 0) return "not_started";
  if (word.wrongCount > word.correctCount) return "needs_work";
  if (word.wrongCount > 0) return "practising";
  if (word.correctCount >= 3) return "steady";
  if (word.correctCount >= 2) return "reliable";
  return "spotted_once";
}

export function spellingProgressColour(word: SpellingProgressCounts): MasteryColour | null {
  switch (spellingProgressStatus(word)) {
    case "needs_work":
      return "red";
    case "practising":
      return "orange";
    case "spotted_once":
      return "yellow";
    case "reliable":
      return "light_green";
    case "steady":
      return "green";
    case "not_started":
      return null;
  }
}

export const spellingFocusStatuses = ["needs_work", "practising", "spotted_once", "reliable", "steady"] as const;

export type SpellingFocus = (typeof spellingFocusStatuses)[number];

export const spellingFocusColours: Record<SpellingFocus, MasteryColour> = {
  needs_work: "red",
  practising: "orange",
  spotted_once: "yellow",
  reliable: "light_green",
  steady: "green"
};

export function parseSpellingFocus(value: string | null | undefined): SpellingFocus | null {
  return spellingFocusStatuses.includes(value as SpellingFocus) ? (value as SpellingFocus) : null;
}
