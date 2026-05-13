import { generateDeepSeekJsonText, type DeepSeekJsonGenerationOptions } from "./deepSeek";

export interface ParentSpellingAssistDraft {
  target: string;
  pairedTarget: string;
  usageLabel: string;
  teachingNote: string;
  sentences: string[];
  warnings: string[];
}

interface ParentSpellingAssistTextDraft {
  pairedTarget: string;
  usageLabel: string;
  teachingNote: string;
  sentences: string[];
}

export interface ParentSpellingAssistOptions {
  textGeneration?: DeepSeekJsonGenerationOptions;
}

export async function generateParentSpellingAssistDraft(
  target: string,
  options: ParentSpellingAssistOptions = {}
): Promise<ParentSpellingAssistDraft> {
  const cleanTarget = target.trim();
  if (!cleanTarget) {
    throw new Error("Enter a spelling word before generating help.");
  }

  const draft = await generateParentSpellingTextDraft(cleanTarget, options.textGeneration);
  return {
    target: cleanTarget,
    pairedTarget: draft.pairedTarget,
    usageLabel: draft.usageLabel,
    teachingNote: draft.teachingNote,
    sentences: draft.sentences,
    warnings: []
  };
}

async function generateParentSpellingTextDraft(
  target: string,
  options?: DeepSeekJsonGenerationOptions
): Promise<ParentSpellingAssistTextDraft> {
  const text = await generateDeepSeekJsonText(buildParentSpellingAssistPrompt(target), {
    temperature: 0.35,
    maxTokens: 1200,
    ...options
  });
  return normaliseTextDraftPayload(text);
}

function buildParentSpellingAssistPrompt(target: string): string {
  return `
You are helping a parent add one spelling item to a calm local-first Year 5 British English learning app.

Generate a JSON object for the target word "${target}" with exactly these keys:
- pairedTarget: string, or "" if there is no useful confusable pair
- usageLabel: string, a child-readable grammar label such as "noun", "verb", "adjective", or "number word"
- teachingNote: string
- sentences: string array of 2 items

Quality bar:
- The teaching note must say what grammatical job the word has and what it means in this use.
- If there is a common pair such as advice/advise, affect/effect, practice/practise, choose that pair.
- If there is no strong pair, use pairedTarget "".
- Each sentence must include the exact target word once.
- Each sentence must make the target word's use clear from context.
- Do not intentionally misspell the target word in these sentences. The app will generate mistake variants separately.
- Use en-GB spelling.

Rules:
- Return JSON only.
- Do not wrap in markdown fences.
  `.trim();
}

function normaliseTextDraftPayload(rawText: string): ParentSpellingAssistTextDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse generated JSON: ${message}`);
  }

  const record = parsed as Record<string, unknown>;
  const sentences = normaliseStringList(record.sentences, 2);
  if (sentences.length === 0) {
    throw new Error("Generated draft did not include usable spelling sentences.");
  }

  return {
    pairedTarget: normaliseOptionalText(record.pairedTarget),
    usageLabel: normaliseRequiredText(record.usageLabel, "usageLabel"),
    teachingNote: normaliseRequiredText(record.teachingNote, "teachingNote"),
    sentences
  };
}

function normaliseRequiredText(value: unknown, field: string): string {
  const text = normaliseOptionalText(value);
  if (!text) {
    throw new Error(`Generated draft was missing ${field}.`);
  }
  return text;
}

function normaliseOptionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normaliseStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const clean = item.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase("en-GB");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
    if (result.length >= limit) break;
  }
  return result;
}
