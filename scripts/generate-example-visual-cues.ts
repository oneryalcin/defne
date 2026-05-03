import { execFile } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import {
  EXAMPLE_VISUAL_CUE_PROMPT_VERSION,
  buildExampleVisualCuePrompt,
  generateExampleVisualCue,
  stablePromptDigest,
  type GeneratedExampleVisualCue,
  type ExampleVisualCueInput
} from "../src/lib/imageGeneration/exampleVisualCues";
import { getDb } from "../src/lib/db";

interface CliOptions {
  limit: number;
  concurrency: number;
  status: "draft" | "approved";
  outDir: string;
  word?: string;
  exampleId?: string;
  includeExisting: boolean;
  dryRun: boolean;
  random: boolean;
  aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  imageSize: "1K" | "2K" | "4K";
  resizeMax: number | null;
  jpegQuality: number;
  originalsDir: string | null;
  retries: number;
  retryDelayMs: number;
  failureLog: string;
  model?: string;
}

interface ExampleCueCandidate extends ExampleVisualCueInput {
  existingCueCount: number;
}

const PROJECT_ROOT = process.cwd();
const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const db = getDb();
  const candidates = listCandidates(db, options);
  const selected = candidates.slice(0, options.limit);

  if (selected.length === 0) {
    console.log("No example cue candidates found.");
    return;
  }

  console.log(
    `Preparing ${selected.length} example cue${selected.length === 1 ? "" : "s"} ` +
      `(concurrency=${options.concurrency}, status=${options.status}, dryRun=${options.dryRun ? "yes" : "no"}).`
  );

  if (options.dryRun) {
    for (const candidate of selected) {
      const prompt = buildExampleVisualCuePrompt(candidate);
      console.log(`\n--- ${candidate.word} / ${candidate.exampleId} ---\n${prompt.slice(0, 1600)}`);
    }
    return;
  }

  const summary = await generateAndPersistCandidates(db, selected, options);
  console.log(`Done. ok=${summary.ok}, failed=${summary.failed}, total=${selected.length}`);
  if (summary.failed > 0) {
    throw new Error(`Some example cues failed. Re-run the same command to resume. Failure log: ${options.failureLog}`);
  }
}

async function generateAndPersistCandidates(
  db: DatabaseSync,
  selected: ExampleCueCandidate[],
  options: CliOptions
): Promise<{ ok: number; failed: number }> {
  let nextIndex = 0;
  let ok = 0;
  let failed = 0;
  const concurrency = Math.max(1, Math.min(options.concurrency, selected.length));

  async function worker(): Promise<void> {
    while (nextIndex < selected.length) {
      const index = nextIndex;
      nextIndex += 1;
      const candidate = selected[index];
      try {
        const cue = await generateWithRetries(candidate, options);
        const relativePath = await persistGeneratedCue(db, cue, options);
        ok += 1;
        console.log(`OK ${ok + failed}/${selected.length} ${candidate.word} / ${candidate.exampleId} -> ${relativePath}`);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`FAILED ${ok + failed}/${selected.length} ${candidate.word} / ${candidate.exampleId}: ${message}`);
        await appendFailure(options.failureLog, candidate, message);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { ok, failed };
}

async function generateWithRetries(candidate: ExampleCueCandidate, options: CliOptions): Promise<GeneratedExampleVisualCue> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      return await generateExampleVisualCue(candidate, {
        aspectRatio: options.aspectRatio,
        imageSize: options.imageSize,
        model: options.model
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < options.retries) {
        const delay = options.retryDelayMs * 2 ** attempt;
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error("Image generation failed");
}

async function persistGeneratedCue(
  db: DatabaseSync,
  cue: GeneratedExampleVisualCue,
  options: CliOptions
): Promise<string> {
  const digest = stablePromptDigest(cue.prompt);
  const originalExtension = extensionForMime(cue.mimeType);
  const originalBytes = Buffer.from(cue.imageBase64, "base64");
  if (options.originalsDir) {
    const originalRelativePath = path
      .join(options.originalsDir, cue.wordId, `${cue.exampleId}-${digest}${originalExtension}`)
      .replaceAll(path.sep, "/");
    const originalAbsolutePath = path.join(PROJECT_ROOT, originalRelativePath);
    await mkdir(path.dirname(originalAbsolutePath), { recursive: true });
    await writeFile(originalAbsolutePath, originalBytes);
  }

  const extension = options.resizeMax ? ".jpg" : originalExtension;
  const relativePath = path.join(options.outDir, cue.wordId, `${cue.exampleId}-${digest}${extension}`).replaceAll(path.sep, "/");
  const absolutePath = path.join(PROJECT_ROOT, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, originalBytes);
  if (options.resizeMax) {
    await optimiseImageForApp(absolutePath, options.resizeMax, options.jpegQuality);
  }
  upsertVisualCue(db, {
    id: `cue_${cue.exampleId}_${digest}`,
    exampleId: cue.exampleId,
    wordId: cue.wordId,
    provider: cue.provider,
    model: cue.model,
    promptVersion: cue.promptVersion,
    prompt: cue.prompt,
    imagePath: relativePath,
    status: options.status
  });
  return relativePath;
}

function listCandidates(db: DatabaseSync, options: CliOptions): ExampleCueCandidate[] {
  const filters: string[] = ["e.status = 'approved'"];
  const params: Array<string | number> = [];
  if (!options.includeExisting) {
    filters.push("NOT EXISTS (SELECT 1 FROM example_visual_cues c WHERE c.example_id = e.id AND c.status IN ('draft', 'approved'))");
  }
  if (options.word) {
    filters.push("w.normalized_word = ?");
    params.push(options.word.trim().toLocaleLowerCase("en-GB"));
  }
  if (options.exampleId) {
    filters.push("e.id = ?");
    params.push(options.exampleId);
  }

  const rows = db
    .prepare(
      `SELECT
         e.id AS example_id,
         e.word_id,
         w.word,
         COALESCE(d.definition, '') AS definition,
         e.sentence,
         COALESCE(
           (SELECT json_group_array(confusable_text)
            FROM word_confusables wc
            WHERE wc.word_id = e.word_id),
           '[]'
         ) AS confusables_json,
         (SELECT COUNT(*)
          FROM example_visual_cues c
          WHERE c.example_id = e.id
            AND c.status IN ('draft', 'approved')) AS existing_cue_count
       FROM word_examples e
       JOIN words w ON w.id = e.word_id
       LEFT JOIN word_definitions d ON d.word_id = e.word_id AND d.is_primary = 1
       WHERE ${filters.join(" AND ")}
       ORDER BY ${options.random ? "RANDOM()" : "w.normalized_word ASC, e.id ASC"}`
    )
    .all(...params) as Array<{
    example_id: string;
    word_id: string;
    word: string;
    definition: string;
    sentence: string;
    confusables_json: string;
    existing_cue_count: number;
  }>;

  return rows.map((row) => ({
    exampleId: row.example_id,
    wordId: row.word_id,
    word: row.word,
    definition: row.definition,
    sentence: row.sentence,
    confusables: parseStringArray(row.confusables_json),
    useDefneCharacter: sentenceMentionsDefne(row.sentence),
    aspectRatio: options.aspectRatio,
    existingCueCount: row.existing_cue_count
  }));
}

function upsertVisualCue(
  db: DatabaseSync,
  cue: {
    id: string;
    exampleId: string;
    wordId: string;
    provider: string;
    model: string;
    promptVersion: string;
    prompt: string;
    imagePath: string;
    status: "draft" | "approved";
  }
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO example_visual_cues
      (id, example_id, word_id, provider, model, prompt_version, prompt, image_path, image_url, status, reviewed_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       provider = excluded.provider,
       model = excluded.model,
       prompt_version = excluded.prompt_version,
       prompt = excluded.prompt,
       image_path = excluded.image_path,
       image_url = NULL,
       status = excluded.status,
       reviewed_at = excluded.reviewed_at,
       updated_at = excluded.updated_at`
  ).run(
    cue.id,
    cue.exampleId,
    cue.wordId,
    cue.provider,
    cue.model,
    cue.promptVersion,
    cue.prompt,
    cue.imagePath,
    cue.status,
    cue.status === "approved" ? now : null,
    now,
    now
  );
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    limit: 5,
    concurrency: 2,
    status: "draft",
    outDir: "public/assets/example-cues",
    includeExisting: false,
    dryRun: false,
    random: false,
    aspectRatio: "1:1",
    imageSize: "1K",
    resizeMax: 512,
    jpegQuality: 65,
    originalsDir: "tmp/example-cue-originals",
    retries: 3,
    retryDelayMs: 2000,
    failureLog: "tmp/example-cue-failures.jsonl"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => {
      const value = args[index + 1];
      if (!value) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === "--limit") options.limit = positiveInt(next(), "--limit");
    else if (arg === "--concurrency") options.concurrency = positiveInt(next(), "--concurrency");
    else if (arg === "--status") options.status = parseStatus(next());
    else if (arg === "--out-dir") options.outDir = next();
    else if (arg === "--word") options.word = next();
    else if (arg === "--example-id") options.exampleId = next();
    else if (arg === "--model") options.model = next();
    else if (arg === "--aspect-ratio") options.aspectRatio = parseAspectRatio(next());
    else if (arg === "--image-size") options.imageSize = parseImageSize(next());
    else if (arg === "--resize-max") options.resizeMax = positiveInt(next(), "--resize-max");
    else if (arg === "--jpeg-quality") options.jpegQuality = boundedInt(next(), "--jpeg-quality", 1, 100);
    else if (arg === "--keep-original-size") options.resizeMax = null;
    else if (arg === "--originals-dir") options.originalsDir = next();
    else if (arg === "--no-originals") options.originalsDir = null;
    else if (arg === "--retries") options.retries = boundedInt(next(), "--retries", 0, 10);
    else if (arg === "--retry-delay-ms") options.retryDelayMs = positiveInt(next(), "--retry-delay-ms");
    else if (arg === "--failure-log") options.failureLog = next();
    else if (arg === "--include-existing") options.includeExisting = true;
    else if (arg === "--random") options.random = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help") printHelpAndExit();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function parseAspectRatio(value: string): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" {
  if (value === "1:1" || value === "3:4" || value === "4:3" || value === "9:16" || value === "16:9") return value;
  throw new Error("--aspect-ratio must be one of 1:1, 3:4, 4:3, 9:16, 16:9");
}

function parseImageSize(value: string): "1K" | "2K" | "4K" {
  if (value === "1K" || value === "2K" || value === "4K") return value;
  throw new Error("--image-size must be one of 1K, 2K, 4K");
}

function parseStatus(value: string): "draft" | "approved" {
  if (value === "draft" || value === "approved") return value;
  throw new Error("--status must be draft or approved");
}

function positiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function boundedInt(value: string, flag: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${flag} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function sentenceMentionsDefne(sentence: string): boolean {
  return /\bdefne\b/i.test(sentence);
}

function extensionForMime(mimeType: string): ".jpg" | ".png" | ".webp" {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  return ".png";
}

async function appendFailure(failureLog: string, candidate: ExampleCueCandidate, message: string): Promise<void> {
  const absolutePath = path.join(PROJECT_ROOT, failureLog);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await appendFile(
    absolutePath,
    `${JSON.stringify({
      at: new Date().toISOString(),
      word: candidate.word,
      wordId: candidate.wordId,
      exampleId: candidate.exampleId,
      message
    })}\n`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function optimiseImageForApp(filePath: string, resizeMax: number, jpegQuality: number): Promise<void> {
  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to optimise ${filePath} with sips: ${message}`);
  }
}

function printHelpAndExit(): never {
  console.log(`Usage:
  npm exec tsx scripts/generate-example-visual-cues.ts -- --limit 20 --concurrency 3

Options:
  --limit <n>           Number of examples to generate. Default: 5
  --concurrency <n>     Parallel Gemini requests. Default: 2
  --status <status>     draft or approved. Default: draft
  --out-dir <path>      Asset output directory. Default: public/assets/example-cues
  --word <word>         Restrict to one normalized word
  --example-id <id>     Restrict to one example row
  --model <model>       Gemini image model. Default comes from the module
  --aspect-ratio <r>    1:1, 3:4, 4:3, 9:16, or 16:9. Default: 1:1
  --image-size <size>   1K, 2K, or 4K. Default: 1K
  --resize-max <px>     Resize longest edge after generation. Default: 512
  --jpeg-quality <n>    JPEG quality after resizing, 1-100. Default: 65
  --keep-original-size  Store Gemini's original generated size
  --originals-dir <dir> Save raw Gemini originals separately. Default: tmp/example-cue-originals
  --no-originals        Do not save separate raw originals
  --retries <n>         Retries per image. Default: 3
  --retry-delay-ms <n>  Initial retry delay in milliseconds. Default: 2000
  --failure-log <path>  JSONL failure log. Default: tmp/example-cue-failures.jsonl
  --include-existing    Generate even if a draft/approved cue already exists
  --random              Select random eligible examples instead of alphabetical order
  --dry-run             Print prompts without calling Gemini or writing DB rows
`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
