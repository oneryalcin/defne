import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  generateExampleVisualCue,
  stablePromptDigest,
  type GeneratedExampleVisualCue
} from "@/lib/imageGeneration/exampleVisualCues";
import { deterministicWordId, normalizeWord } from "@/lib/db/seed";

const execFileAsync = promisify(execFile);
const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
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

export async function generateParentWordAssistDraft(word: string): Promise<ParentWordAssistDraft> {
  const cleanWord = word.trim();
  if (!cleanWord) {
    throw new Error("Enter a word before generating help.");
  }

  const textDraft = await generateParentWordTextDraft(cleanWord);
  const wordId = deterministicWordId(normalizeWord(cleanWord));
  const warnings: string[] = [];
  const examples = await Promise.all(
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
  );

  return {
    word: cleanWord,
    definition: textDraft.definition,
    synonyms: textDraft.synonyms,
    antonyms: textDraft.antonyms,
    examples,
    warnings
  };
}

async function generateParentWordTextDraft(word: string): Promise<ParentWordAssistTextDraft> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured, so assisted generation is unavailable.");
  }

  const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(GEMINI_TEXT_MODEL)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildParentWordAssistPrompt(word) }]
        }
      ],
      generationConfig: {
        temperature: 0.5,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Text generation failed (${response.status}): ${body.slice(0, 600)}`);
  }

  const json = (await response.json()) as GeminiTextResponse;
  const text = extractGeminiText(json);
  return normaliseTextDraftPayload(text);
}

function buildParentWordAssistPrompt(word: string): string {
  return `
You are helping a parent add one vocabulary word to a calm local-first Year 5 vocabulary app in British English.

Generate a JSON object for the word "${word}" with exactly these keys:
- definition: string
- synonyms: string array of 2 items
- antonyms: string array of 2 items
- examples: string array of 3 items

Quality bar:
- Definition: child-legible, concrete, one sentence, no dictionary jargon.
- Examples: each must be distinct, vivid, and meaning-forward. They should help a child infer the word from context, not just insert the word into a bland template.
- The target word must be supported by observable evidence in the same sentence. If the target word were blanked out, a child should still be able to guess the meaning from actions, causes, consequences, body language, timing, contrast, or objects.
- Avoid weak template examples like "a brisk walk helped us feel awake" where the sentence mainly repeats a common phrase. For speed or pace meanings, show the pace: people almost jogging, keeping up, arriving faster, breath warming in the air, footsteps tapping quickly, or someone asking the group to slow down.
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

function extractGeminiText(response: GeminiTextResponse): string {
  for (const candidate of response.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }
  throw new Error("Text generation returned no draft content.");
}

function normaliseTextDraftPayload(rawText: string): ParentWordAssistTextDraft {
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

  return {
    definition: normaliseRequiredText(record.definition, "definition"),
    synonyms: normaliseStringList(record.synonyms, 2).slice(0, 2),
    antonyms: normaliseStringList(record.antonyms, 2).slice(0, 2),
    examples
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
  await execFileAsync("sips", [
    "-Z",
    String(resizeMax),
    "--setProperty",
    "format",
    "jpeg",
    "--setProperty",
    "formatOptions",
    String(jpegQuality),
    filePath,
    "--out",
    filePath
  ]);
}

interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}
