export interface SpellingPracticeItem {
  id: string;
  target: string;
  teachingNote: string;
  studyGroup: string;
  usageLabel: string;
  commonMisspelling?: string | null;
  confusables?: string[];
  prompts: Array<{
    id: string;
    sentence: string;
  }>;
}

export interface SpellingSentenceToken {
  index: number;
  text: string;
  isWord: boolean;
}

export interface SpellingQuestion {
  itemId: string;
  promptId: string | null;
  target: string;
  sourceSentence: string;
  displayedSentence: string;
  tokens: SpellingSentenceToken[];
  expectedSelection: string;
  correctTokenIndex: number | null;
  displayedWord: string | null;
  correctWord: string;
  issueKind: "none" | "confusable" | "misspelling";
}

export interface SpellingAssessment {
  isCorrect: boolean;
  normalizedSubmitted: string;
}

const ALL_CORRECT_SELECTION = "all_correct";

const COMMON_MISSPELLINGS = new Map<string, string>([
  ["advice", "advise"],
  ["advise", "advize"],
  ["affect", "afect"],
  ["effect", "efect"],
  ["pray", "praye"],
  ["prey", "preey"],
  ["horse", "hourse"],
  ["hoarse", "horce"],
  ["seize", "sieze"],
  ["waist", "waest"],
  ["thyme", "thime"],
  ["hare", "hair"],
  ["forty", "fourty"],
  ["weary", "weery"]
]);

export function buildSpellingQuestion(
  item: SpellingPracticeItem,
  questionIndex: number,
  sessionItems: SpellingPracticeItem[] = []
): SpellingQuestion {
  const prompt = selectPrompt(item, questionIndex);
  const confusable = selectConfusable(item, sessionItems);
  const issueKind = selectIssueKind(item, questionIndex, confusable);
  const displayedWord =
    issueKind === "none"
      ? null
      : issueKind === "confusable"
        ? confusable
        : misspellWord(item);
  const displayedSentence = displayedWord
    ? replaceTargetInSentence(prompt.sentence, item.target, displayedWord)
    : prompt.sentence;
  const tokens = tokenizeSentence(displayedSentence);
  const correctTokenIndex = displayedWord ? findTokenIndex(tokens, displayedWord) : null;

  return {
    itemId: item.id,
    promptId: prompt.id,
    target: item.target,
    sourceSentence: prompt.sentence,
    displayedSentence,
    tokens,
    expectedSelection: correctTokenIndex === null ? ALL_CORRECT_SELECTION : tokenSelection(correctTokenIndex),
    correctTokenIndex,
    displayedWord,
    correctWord: item.target,
    issueKind
  };
}

export function assessSpellingAnswer(question: SpellingQuestion, submittedAnswer: string): SpellingAssessment {
  const normalizedSubmitted = normalizeSpellingAnswer(submittedAnswer);
  return {
    isCorrect: normalizedSubmitted === question.expectedSelection,
    normalizedSubmitted
  };
}

export function normalizeSpellingAnswer(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

export function allCorrectSelection(): string {
  return ALL_CORRECT_SELECTION;
}

export function tokenSelection(tokenIndex: number): string {
  return `word:${tokenIndex}`;
}

function selectPrompt(item: SpellingPracticeItem, questionIndex: number): { id: string | null; sentence: string } {
  const prompts = item.prompts
    .map((prompt) => ({
      id: prompt.id,
      sentence: prompt.sentence.trim()
    }))
    .filter((prompt) => prompt.sentence.length > 0);
  if (prompts.length === 0) return { id: null, sentence: `${item.target} belongs in this sentence.` };
  return prompts[Math.max(0, questionIndex) % prompts.length];
}

function selectConfusable(item: SpellingPracticeItem, sessionItems: SpellingPracticeItem[]): string | null {
  const target = normalizeSpellingAnswer(item.target);
  const peer = sessionItems.find(
    (candidate) => candidate.studyGroup === item.studyGroup && normalizeSpellingAnswer(candidate.target) !== target
  );
  return peer?.target ?? item.confusables?.find((confusable) => normalizeSpellingAnswer(confusable) !== target) ?? null;
}

function selectIssueKind(
  item: SpellingPracticeItem,
  questionIndex: number,
  confusable: string | null
): SpellingQuestion["issueKind"] {
  if (questionIndex % 4 === 0) return "none";
  if (confusable && questionIndex % 2 === 1) return "confusable";
  return misspellWord(item) === item.target ? "none" : "misspelling";
}

function misspellWord(item: SpellingPracticeItem): string {
  const word = item.target;
  const configured = item.commonMisspelling?.trim();
  if (configured && normalizeSpellingAnswer(configured) !== normalizeSpellingAnswer(word)) {
    return preserveCapitalization(word, configured);
  }

  const normalized = normalizeSpellingAnswer(word);
  const known = COMMON_MISSPELLINGS.get(normalized);
  if (known && known !== normalized) return preserveCapitalization(word, known);

  const doubleLetter = /(.)\1/i.exec(word);
  if (doubleLetter?.index !== undefined) {
    return `${word.slice(0, doubleLetter.index)}${word.slice(doubleLetter.index + 1)}`;
  }

  if (word.length > 4) return `${word.slice(0, -1)}${word.at(-2) ?? ""}${word.at(-1) ?? ""}`;
  return word;
}

function replaceTargetInSentence(sentence: string, target: string, replacement: string): string {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sentence.replace(new RegExp(`\\b${escaped}\\b`, "i"), replacement);
}

function tokenizeSentence(sentence: string): SpellingSentenceToken[] {
  const matches = sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+|\s+|./g) ?? [];
  return matches.map((text, index) => ({
    index,
    text,
    isWord: /^[A-Za-z]+(?:'[A-Za-z]+)?$/.test(text)
  }));
}

function findTokenIndex(tokens: SpellingSentenceToken[], displayedWord: string): number | null {
  const normalized = normalizeSpellingAnswer(displayedWord);
  const token = tokens.find((candidate) => candidate.isWord && normalizeSpellingAnswer(candidate.text) === normalized);
  return token?.index ?? null;
}

function preserveCapitalization(original: string, replacement: string): string {
  if (!original[0] || original[0] !== original[0].toLocaleUpperCase("en-GB")) return replacement;
  return `${replacement[0]?.toLocaleUpperCase("en-GB") ?? ""}${replacement.slice(1)}`;
}
