import { masteryColours, type MasteryColour } from "../types";

export const vocabularyFocusColours = masteryColours;
export type VocabularyFocus = MasteryColour;

export const vocabularyFocusLabels: Record<VocabularyFocus, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered",
};

export function parseVocabularyFocus(value: string | undefined | null): VocabularyFocus | null {
  return masteryColours.includes(value as VocabularyFocus) ? (value as VocabularyFocus) : null;
}
