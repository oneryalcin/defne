import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  generateExampleVisualCue,
  stablePromptDigest,
  type GeneratedExampleVisualCue
} from "@/lib/imageGeneration/exampleVisualCues";
import { deterministicWordId, normalizeWord } from "@/lib/db/seed";
import { normaliseParentVocabularyWord } from "@/lib/normalization";
import { generateDeepSeekJsonText, type DeepSeekJsonGenerationOptions } from "./deepSeek";

const DRAFT_IMAGE_DIR = "public/assets/example-cues/drafts";
const DRAFT_IMAGE_SEGMENTS = ["public", "assets", "example-cues", "drafts"] as const;

export interface ParentWordAssistDraft {
  word: string;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  examples: Array<{
    sentence: string;
    visualCue: null | {
      exampleId: string;
      provider: "gemini";
      model: string;
      promptVersion: string;
      prompt: string;
      imagePath: string;
    };
  }>;
  warnings: string[];
}

interface ParentWordAssistTextDraft {
  definition: string;
  synonyms: string[];
  antonyms: string[];
  examples: string[];
}

export interface ParentWordAssistOptions {
  generateImages?: boolean;
  textGeneration?: DeepSeekJsonGenerationOptions;
}

export async function generateParentWordAssistDraft(
  word: string,
  options: ParentWordAssistOptions = {}
): Promise<ParentWordAssistDraft> {
  const cleanWord = normaliseParentVocabularyWord(word);
  if (!cleanWord) {
    throw new Error("Enter a word before generating help.");
  }

  const textDraft = await generateParentWordTextDraft(cleanWord, options.textGeneration);
  const wordId = deterministicWordId(normalizeWord(cleanWord));
  const warnings: string[] = [];
  const examples = options.generateImages
    ? await Promise.all(
        textDraft.examples.map(async (sentence, index) => {
          try {
            const cue = await generateAndStoreDraftVisualCue({
              word: cleanWord,
              wordId,
              definition: textDraft.definition,
              sentence,
              exampleIndex: index
            });
            return {
              sentence,
              visualCue: {
                exampleId: cue.exampleId,
                provider: cue.provider,
                model: cue.model,
                promptVersion: cue.promptVersion,
                prompt: cue.prompt,
                imagePath: cue.imagePath
              }
            };
          } catch (error) {
            warnings.push(
              `Image ${index + 1} could not be generated${error instanceof Error && error.message ? `: ${error.message}` : "."}`
            );
            return { sentence, visualCue: null };
          }
        })
      )
    : textDraft.examples.map((sentence) => ({ sentence, visualCue: null }));

  return {
    word: cleanWord,
    definition: textDraft.definition,
    synonyms: textDraft.synonyms,
    antonyms: textDraft.antonyms,
    examples,
    warnings
  };
}

async function generateParentWordTextDraft(
  word: string,
  options?: DeepSeekJsonGenerationOptions
): Promise<ParentWordAssistTextDraft> {
  const basePrompt = buildParentWordAssistPrompt(word);
  let validationMessage: string | null = null;
  let lastValidationError: unknown = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const text = await generateDeepSeekJsonText(buildParentWordAssistPromptWithFeedback(basePrompt, validationMessage), {
      temperature: 0.5,
      maxTokens: 1600,
      ...options
    });
    try {
      return normaliseTextDraftPayload(text, word);
    } catch (error) {
      lastValidationError = error;
      validationMessage = error instanceof Error ? error.message : String(error);
    }
  }

  throw lastValidationError instanceof Error ? lastValidationError : new Error("Generated draft failed validation.");
}

function buildParentWordAssistPrompt(word: string): string {
  const forbiddenDefinitionForms = targetWordForms(word).map((form) => `"${form}"`).join(", ");
  return `
You are helping a parent add one vocabulary word to a calm local-first Year 5 vocabulary app in British English.

Generate a JSON object for the word "${word}" with exactly these keys:
- definition: string
- synonyms: string array of 2 items
- antonyms: string array of 2 items
- examples: string array of 3 items

Quality bar:
- Definition: child-legible, concrete, one sentence, no dictionary jargon.
- Definition must be a meaning phrase, as if it followed "It means ..."; do not start with "${word} is", "a ${word} is", or "${word} means".
- Do not include any of these exact words in the definition: ${forbiddenDefinitionForms}.
- Examples: each must be distinct, vivid, and meaning-forward. They should help a child infer the word from context, not just insert the word into a bland template.
- Each example must include the exact target word "${word}" once, using that spelling and form. Do not substitute a derivative or inflected form.
- The target word must be supported by observable evidence in the same sentence. If the target word were blanked out, a child should still be able to guess the meaning from actions, causes, consequences, body language, timing, contrast, or objects.
- Avoid weak template examples like "a brisk walk helped us feel awake" where the sentence mainly repeats a common phrase. For speed or pace meanings, show the pace: people almost jogging, keeping up, arriving faster, breath warming in the air, footsteps tapping quickly, or someone asking the group to slow down.
- Avoid teaching the word by negating it, such as "not ${word}" or "no longer ${word}". Use positive examples where the context demonstrates the meaning directly.
- For words with multiple senses, choose one child-useful main sense and make all three examples teach that same sense clearly unless the definition explicitly covers more than one.
- Examples may be multi-clause if that improves clarity.
- Use a mix of settings when possible: home, outdoors, school, hobby, nature, travel, community life.
- Avoid repetition across the three examples.
- Avoid babyish tone.
- Prefer wording that could become reviewed canonical content after a parent's edit.

Rules:
- Return JSON only.
- Do not wrap in markdown fences.
- Keep examples free of quotes around the target word.
- Use en-GB spelling.
- Before returning, silently check each example: "What exact words in this sentence reveal the meaning?" If the answer is only the target word or a stock collocation, rewrite it.
  `.trim();
}

function buildParentWordAssistPromptWithFeedback(basePrompt: string, validationMessage: string | null): string {
  if (!validationMessage) return basePrompt;
  return `${basePrompt}

Your previous JSON was rejected by the app validator:
${validationMessage}

Return a new corrected JSON object only.`;
}

function normaliseTextDraftPayload(rawText: string, word: string): ParentWordAssistTextDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse generated JSON: ${message}`);
  }

  const record = parsed as Record<string, unknown>;
  const examples = normaliseStringList(record.examples, 3);
  if (examples.length !== 3) {
    throw new Error("Generated draft did not include exactly 3 examples.");
  }
  const definition = removeLeadingTargetDefinitionPrefix(normaliseRequiredText(record.definition, "definition"), word);
  if (containsDisallowedTargetForm(definition, word)) {
    throw new Error(`Generated draft used the target word or a close form in its definition: ${definition}`);
  }
  const invalidExample = examples.find((example) => countExactWordOccurrences(example, word) !== 1);
  if (invalidExample) {
    throw new Error(`Generated draft used a non-exact target word form in example: ${invalidExample}`);
  }
  const exampleWithDerivedForm = examples.find((example) => containsDisallowedTargetForm(example, word, { allowExact: true }));
  if (exampleWithDerivedForm) {
    throw new Error(`Generated draft used a close target word form in example: ${exampleWithDerivedForm}`);
  }

  return {
    definition,
    synonyms: normaliseStringList(record.synonyms, 2).slice(0, 2),
    antonyms: normaliseStringList(record.antonyms, 2).slice(0, 2),
    examples
  };
}

function countExactWordOccurrences(text: string, word: string): number {
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word)}(?=$|[^\\p{L}\\p{N}])`, "giu");
  return Array.from(text.matchAll(pattern)).length;
}

function containsDisallowedTargetForm(
  text: string,
  word: string,
  options: { allowExact?: boolean } = {}
): boolean {
  const disallowedForms = targetWordForms(word).filter((form) => !options.allowExact || form !== word.toLocaleLowerCase("en-GB"));
  if (disallowedForms.length === 0) return false;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${disallowedForms.map(escapeRegExp).join("|")})(?=$|[^\\p{L}\\p{N}])`,
    "iu"
  );
  return pattern.test(text);
}

function removeLeadingTargetDefinitionPrefix(text: string, word: string): string {
  const lower = word.trim().toLocaleLowerCase("en-GB");
  if (!lower || /\s/.test(lower)) return text;
  const quotedWord = `["'“”‘’]?${escapeRegExp(word.trim())}["'“”‘’]?`;
  const pattern = new RegExp(
    `^\\s*(?:(?:a|an|the)\\s+)?${quotedWord}\\s*(?::|-|\\b(?:is|means|refers to|describes)\\b)\\s+`,
    "iu"
  );
  const cleaned = text.replace(pattern, "").trim();
  return cleaned || text;
}

function targetWordForms(word: string): string[] {
  const lower = word.trim().toLocaleLowerCase("en-GB");
  if (!lower || /\s/.test(lower)) return lower ? [lower] : [];
  const forms = new Set([lower, `${lower}s`, `${lower}ed`, `${lower}ing`]);
  if (/(s|x|z|ch|sh)$/.test(lower)) {
    forms.add(`${lower}es`);
  }
  if (/z$/.test(lower)) {
    forms.add(`${lower}zes`);
  }
  if (lower.endsWith("e")) {
    forms.add(`${lower}d`);
    forms.add(`${lower.slice(0, -1)}ing`);
  }
  if (lower.endsWith("y")) {
    forms.add(`${lower.slice(0, -1)}ies`);
  }
  return Array.from(forms).sort((a, b) => b.length - a.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function generateAndStoreDraftVisualCue(input: {
  word: string;
  wordId: string;
  definition: string;
  sentence: string;
  exampleIndex: number;
}): Promise<GeneratedExampleVisualCue & { imagePath: string }> {
  const exampleId = `draft_example_${input.exampleIndex}`;
  const generated = await generateExampleVisualCue({
    exampleId,
    wordId: input.wordId,
    word: input.word,
    definition: input.definition,
    sentence: input.sentence,
    aspectRatio: "9:16"
  });

  const extension = extensionForMime(generated.mimeType);
  const digest = stablePromptDigest(generated.prompt);
  const filename = `${exampleId}-${digest}${extension}`;
  const relativePath = path.join(DRAFT_IMAGE_DIR, input.wordId, filename).replaceAll(path.sep, "/");
  const absolutePath = path.join(process.cwd(), ...DRAFT_IMAGE_SEGMENTS, input.wordId, filename);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(generated.imageBase64, "base64"));
  await optimiseImageForApp(absolutePath, 512, 65);

  return { ...generated, imagePath: `/${relativePath.replace(/^public\//, "")}` };
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".jpg";
}

async function optimiseImageForApp(filePath: string, resizeMax: number, jpegQuality: number): Promise<void> {
  const optimized = await sharp(filePath)
    .resize({ width: resizeMax, height: resizeMax, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: jpegQuality, mozjpeg: true })
    .toBuffer();
  await writeFile(filePath, optimized);
}
