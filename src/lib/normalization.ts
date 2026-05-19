export function normaliseParentVocabularyWord(value: string): string {
  return value
    .trim()
    .normalize("NFKC")
    .replace(/\u0130/g, "I")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-GB");
}

export function normaliseParentSpellingWord(value: string): string {
  return normaliseParentVocabularyWord(value);
}
