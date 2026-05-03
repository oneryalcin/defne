import { createHash } from "node:crypto";

export const EXAMPLE_VISUAL_CUE_PROMPT_VERSION = "example-cue-sketch-v1";

export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image-preview";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export interface ExampleVisualCueInput {
  exampleId: string;
  wordId: string;
  word: string;
  definition: string;
  sentence: string;
  confusables?: string[];
  useDefneCharacter?: boolean;
  visualFocus?: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
}

export interface ImageReference {
  mimeType: string;
  base64: string;
}

export interface GeminiImageGenerationOptions {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  imageSize?: "1K" | "2K" | "4K";
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  referenceImage?: ImageReference;
}

export interface GeneratedExampleVisualCue {
  exampleId: string;
  wordId: string;
  promptVersion: string;
  prompt: string;
  provider: "gemini";
  model: string;
  mimeType: string;
  imageBase64: string;
  textNotes: string[];
}

export interface BatchGenerationOptions extends GeminiImageGenerationOptions {
  concurrency?: number;
  continueOnError?: boolean;
}

export type BatchGenerationResult =
  | { ok: true; input: ExampleVisualCueInput; cue: GeneratedExampleVisualCue }
  | { ok: false; input: ExampleVisualCueInput; error: Error };

export function buildExampleVisualCuePrompt(input: ExampleVisualCueInput): string {
  const trimmedWord = input.word.trim();
  const trimmedDefinition = trimTrailingSentencePunctuation(input.definition);
  const trimmedSentence = input.sentence.trim();
  const visualFocus = input.visualFocus?.trim() || inferVisualFocus(input);
  const confusableText = (input.confusables ?? [])
    .map((confusable) => confusable.trim())
    .filter(Boolean)
    .join(", ");
  const characterBlock = input.useDefneCharacter
    ? `
character:
Use Defne as the recurring child character only if the example needs a person. Defne is around 9 to 10 years old, with dark wavy hair partly tied with a tiny faint green clip, olive-warm skin barely tinted, a soft cream jumper, a long faint forest-green skirt, and plain canvas trainers. She does not look at the viewer. Keep her expression small and inward, never exaggerated. If any child figure appears, use soft rounded features, cozy simple clothing, and natural pencil shading while staying restrained rather than mascot-like.
`
    : `
character:
No recurring character unless the scene truly needs a person. Prefer objects, settings, posture, and cause/effect details that directly support the example sentence. If any child figure appears, use soft rounded features, cozy simple clothing, and natural pencil shading while staying restrained rather than mascot-like.
`;

  const aspectRatio = input.aspectRatio ?? "1:1";
  const aspectRatioInstruction =
    aspectRatio === "1:1"
      ? "square, suitable for a small app thumbnail around 200-256px"
      : `${aspectRatio}, suitable for a small app visual cue that may be cropped or resized in the UI`;

  return `
subject:
A small visual mnemonic for the vocabulary word "${trimmedWord}" — meaning "${trimmedDefinition}". This image is a memory aide for a child's vocabulary card. It must communicate the meaning in two seconds and never compete with the UI text.

example anchor:
"${trimmedSentence}"

scene:
Illustrate the example sentence directly, choosing one clear visual moment that makes "${trimmedWord}" inferable from context. The scene should be interesting and memorable, but restrained. ${visualFocus}
${characterBlock}
style lock:
Children's educational illustration with an editorial storybook and worksheet feel, drawn on warm off-white cream paper. Graphite pencil line work dominates; mostly monochrome grey pencil lines, loose sketch strokes, delicate crosshatching, visible pencil texture, lightly shaded contours, and gentle natural shading carry most of the image. Add only heavily desaturated watercolour wash, around 25-35% saturation, as whisper-faint muted olive, green-grey, sage, warm beige, or pale grey accents. Pencil first; colour barely suggests material, temperature, or mood. Low contrast, quiet, natural, slightly unfinished sketchbook feel. Never photoreal. Never cartoonish. Never glossy. Never glowing.

composition lock:
Small educational mnemonic visual cue, aspect ratio ${aspectRatio}. One continuous scene only. Single readable subject or single subject group. Generous cream-paper empty space. The meaning must be readable in two seconds but must not compete with UI text. No inset panels. No borders. No frames. No labels. No writing. No diagrams. No arrows. No symbolic sound/action marks. If an object could contain writing, keep it blank, turned away, or too faint to read.

palette lock:
Warm off-white cream paper canvas, monochrome grey graphite lines, muted olive, green-grey, faint forest green, sage, warm beige, pale grey, and very muted earth washes only when useful. No purple. No violet. No neon. No harsh red. No bright yellow. No bright blue. No bold colours. No full saturation.

avoid:
Full-saturation colour, bold colour, modern picture-book brightness, digital glossy finish, airbrushed rendering, glow, sparkle, halo, particle effects, embedded text, logos, watermarks, readable handwriting, readable book covers, readable signs, photoreal rendering, cartoon mascot, exaggerated features, eye contact with viewer, decorative borders, badge chrome, coin chrome, streak chrome, high-detail background, mini-scenes, split panels, UI elements${confusableText ? `, anything that visually teaches a confusable instead of the target word (${confusableText})` : ""}.

aspect ratio:
${aspectRatioInstruction}.
`.trim();
}

function trimTrailingSentencePunctuation(value: string): string {
  return value.trim().replace(/[.!?]+$/g, "");
}

function inferVisualFocus(input: ExampleVisualCueInput): string {
  const text = `${input.word} ${input.definition} ${input.sentence}`.toLocaleLowerCase("en-GB");
  const focuses: string[] = [
    "Use concrete visual evidence from the sentence rather than a generic dictionary symbol."
  ];

  if (/\b(railway|railroad|rail|track|tracks|platform|train)\b/.test(text) && /\b(grew|grow|growth|fern|ferns|ivy|wildflower|wildflowers|grass|grasses|green|verdant|leaf|leaves)\b/.test(text)) {
    focuses.push(
      "Keep the camera close to the old railway details and the plant growth: ferns, grasses, leaves, or wildflowers emerging between sleepers or rails. Do not turn this into a broad landscape or walking scene; the plant growth reclaiming the railway is the subject."
    );
  } else if (/\b(grew|grow|growth|fern|ferns|ivy|wildflower|wildflowers|grass|grasses|green|verdant|leaf|leaves|plant|plants|garden)\b/.test(text)) {
    focuses.push(
      "Keep the framing close enough that the viewer can inspect the plant growth. Let leaves, stems, shoots, or healthy greenery carry the meaning instead of a wide scenic view."
    );
  }

  if (/\b(museum|display|poster|map|calendar|book|letter|certificate|sign|page|label|worksheet|notice)\b/.test(text)) {
    focuses.push(
      "If the scene includes a museum display, calendar, book, paper, certificate, map, sign, or label, it must be blank, turned away, cropped, or reduced to unreadable pencil texture. Never add readable letters, numbers, headings, captions, titles, or pseudo-writing."
    );
  }

  if (/\b(hospitality|guest|guests|visitor|visitors|welcome|welcomed|soup|blanket|blankets|fire|fireplace|walkers)\b/.test(text)) {
    focuses.push(
      "Show the act of welcome clearly: a warm bowl, blanket, open hands, a doorway, or a fireside arrangement. Keep the kindness visible through posture and objects, not through text or signs."
    );
  }

  if (/\b(yearn|long for|longed|wish|wished|missing|far away|summer|window|calendar)\b/.test(text)) {
    focuses.push(
      "Show longing through stillness and distance: someone or something quietly facing a window, an empty space, or a seasonal contrast. Avoid arrows, thought bubbles, labels, or melodrama."
    );
  }

  if (/\b(reluctant|apprehensive|timid|hesitant|nervous|worried|afraid|afraid|perplexed|confused)\b/.test(text)) {
    focuses.push(
      "If a person appears, make the meaning readable through posture and gaze: shoulders, hands, stance, and where they look. Avoid tears, panic, exaggerated expressions, or direct eye contact."
    );
  }

  return focuses.join(" ");
}

export function stablePromptDigest(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 12);
}

export async function generateExampleVisualCue(
  input: ExampleVisualCueInput,
  options: GeminiImageGenerationOptions = {}
): Promise<GeneratedExampleVisualCue> {
  const prompt = buildExampleVisualCuePrompt(input);
  const model = options.model ?? DEFAULT_GEMINI_IMAGE_MODEL;
  const response = await generateGeminiImage(prompt, { ...options, model, aspectRatio: options.aspectRatio ?? input.aspectRatio });
  return {
    exampleId: input.exampleId,
    wordId: input.wordId,
    promptVersion: EXAMPLE_VISUAL_CUE_PROMPT_VERSION,
    prompt,
    provider: "gemini",
    model,
    mimeType: response.mimeType,
    imageBase64: response.imageBase64,
    textNotes: response.textNotes
  };
}

export async function generateExampleVisualCueBatch(
  inputs: ExampleVisualCueInput[],
  options: BatchGenerationOptions = {}
): Promise<BatchGenerationResult[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, inputs.length || 1));
  const results: BatchGenerationResult[] = new Array(inputs.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const input = inputs[index];
      try {
        results[index] = { ok: true, input, cue: await generateExampleVisualCue(input, options) };
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        results[index] = { ok: false, input, error: normalized };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (!options.continueOnError) {
    const failed = results.find((result): result is Extract<BatchGenerationResult, { ok: false }> => result?.ok === false);
    if (failed) throw failed.error;
  }
  return results;
}

async function generateGeminiImage(
  prompt: string,
  options: GeminiImageGenerationOptions
): Promise<{ mimeType: string; imageBase64: string; textNotes: string[] }> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for Gemini image generation.");
  }

  const model = options.model ?? DEFAULT_GEMINI_IMAGE_MODEL;
  const endpoint = options.endpoint ?? GEMINI_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (options.referenceImage) {
    parts.push({
      inlineData: {
        mimeType: options.referenceImage.mimeType,
        data: options.referenceImage.base64
      }
    });
  }

  const response = await fetchImpl(`${endpoint}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: options.aspectRatio ?? "1:1",
          imageSize: options.imageSize ?? "1K"
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Gemini image generation failed (${response.status}): ${body.slice(0, 1000)}`);
  }

  const json = (await response.json()) as GeminiGenerateContentResponse;
  const textNotes: string[] = [];
  for (const candidate of json.candidates ?? []) {
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) textNotes.push(part.text);
      if (part.inlineData?.data) {
        return {
          mimeType: part.inlineData.mimeType ?? "image/png",
          imageBase64: part.inlineData.data,
          textNotes
        };
      }
    }
  }

  throw new Error("Gemini image generation returned no inline image data.");
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType?: string;
          data?: string;
        };
      }>;
    };
  }>;
}
