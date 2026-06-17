import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { scoreFromState } from "../learning/scoring";
import type { AttemptRecord, LearnerWordState, MasteryColour } from "../types";

const DEFAULT_LEARNER_ID = "learner_defne";
const SEEDED_VISUAL_CUE_PROVIDER = "seed_asset";
const SEEDED_VISUAL_CUE_PROMPT_VERSION = "example-cue-sketch-v1";

interface SeedEntry {
  word: string;
  difficulty: number;
  definition: string;
  example?: string;
  examples?: string[];
  synonyms?: string[];
  antonyms?: string[];
  confusables?: string[];
}

interface SeedPack {
  entries: SeedEntry[];
}

interface SpellingSeedEntry {
  target: string;
  difficulty: number;
  studyGroup?: string;
  usageLabel?: string;
  teachingNote?: string;
  commonMisspelling?: string;
  sentences: string[];
}

interface SpellingSeedPack {
  entries: SpellingSeedEntry[];
}

export function seedInitialData(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO learners (id, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?)`
  ).run(DEFAULT_LEARNER_ID, "Defne", now, now);

  db.prepare(
    `INSERT OR IGNORE INTO learner_profiles
      (learner_id, year_group, locale, interests_json, avatar_style, avatar_traits_json,
       next_round_new_count, next_round_recovery_count, next_round_review_count, next_round_stable_count,
       created_at, updated_at)
     VALUES (?, 'Year 5', 'en-GB', ?, 'pencil_drawing', ?, 6, 3, 3, 0, ?, ?)`
  ).run(DEFAULT_LEARNER_ID, JSON.stringify(["stories", "drawing", "word games"]), JSON.stringify({ style: "warm pencil sketch" }), now, now);

  if (tableExists(db, "learner_access_codes")) {
    db.prepare(
      `INSERT OR IGNORE INTO learner_access_codes (access_code, learner_id, created_at, updated_at)
       VALUES ('arina', ?, ?, ?)`
    ).run(DEFAULT_LEARNER_ID, now, now);
  }

  const seedPack = readSeedPack();
  for (const entry of seedPack.entries) {
    upsertSeedWord(db, entry, now);
  }
  upsertSeedExampleVisualCues(db, now);

  const spellingSeedPack = readSpellingSeedPack();
  for (const entry of spellingSeedPack.entries) {
    upsertSeedSpellingItem(db, entry, now);
  }

  const wordRows = db.prepare("SELECT id FROM words WHERE source = 'seed' AND status = 'active'").all() as Array<{ id: string }>;
  for (const row of wordRows) {
    if (tableExists(db, "learner_vocabulary_words")) {
      db.prepare(
        `INSERT OR IGNORE INTO learner_vocabulary_words
          (learner_id, word_id, status, assigned_at, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?, ?)`
      ).run(DEFAULT_LEARNER_ID, row.id, now, now, now);
    }
    db.prepare(
      `INSERT OR IGNORE INTO learner_word_state
        (id, learner_id, word_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`state_${DEFAULT_LEARNER_ID}_${row.id}`, DEFAULT_LEARNER_ID, row.id, now, now);
  }

  if (tableExists(db, "learner_spelling_items")) {
    const spellingRows = db.prepare("SELECT id FROM spelling_items WHERE source = 'seed' AND status = 'active'").all() as Array<{ id: string }>;
    for (const row of spellingRows) {
      db.prepare(
        `INSERT OR IGNORE INTO learner_spelling_items
          (learner_id, item_id, status, assigned_at, created_at, updated_at)
         VALUES (?, ?, 'active', ?, ?, ?)`
      ).run(DEFAULT_LEARNER_ID, row.id, now, now, now);
    }
  }

  reconcileEarnedVocabularyMastery(db, now);
}

export function defaultLearnerId(): string {
  return DEFAULT_LEARNER_ID;
}

function upsertSeedWord(db: DatabaseSync, entry: SeedEntry, now: string): void {
  const normalized = normalizeWord(entry.word);
  const wordId = deterministicWordId(normalized);

  db.prepare(
    `INSERT INTO words (id, word, normalized_word, difficulty_level, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'seed', 'active', ?, ?)
     ON CONFLICT(normalized_word) DO UPDATE SET
       word = excluded.word,
       difficulty_level = excluded.difficulty_level,
       updated_at = excluded.updated_at`
  ).run(wordId, entry.word.trim(), normalized, clampDifficulty(entry.difficulty), now, now);

  replaceRows(db, "word_definitions", wordId);
  db.prepare(
    `INSERT INTO word_definitions
      (id, word_id, definition, part_of_speech, is_primary, created_at, updated_at)
     VALUES (?, ?, ?, NULL, 1, ?, ?)`
  ).run(`definition_${wordId}`, wordId, entry.definition.trim(), now, now);

  const examples = uniqueTexts([...(entry.examples ?? []), entry.example ?? ""]);
  reconcileSeedExamples(db, wordId, examples, now);

  replaceRows(db, "word_synonyms", wordId);
  for (const [index, synonym] of (entry.synonyms ?? []).entries()) {
    db.prepare("INSERT INTO word_synonyms (id, word_id, synonym, created_at) VALUES (?, ?, ?, ?)").run(
      `synonym_${wordId}_${index}`,
      wordId,
      synonym.trim(),
      now
    );
  }

  replaceRows(db, "word_antonyms", wordId);
  for (const [index, antonym] of (entry.antonyms ?? []).entries()) {
    db.prepare("INSERT INTO word_antonyms (id, word_id, antonym, created_at) VALUES (?, ?, ?, ?)").run(
      `antonym_${wordId}_${index}`,
      wordId,
      antonym.trim(),
      now
    );
  }

  replaceRows(db, "word_confusables", wordId);
  for (const [index, confusable] of (entry.confusables ?? []).entries()) {
    db.prepare(
      `INSERT INTO word_confusables
        (id, word_id, confusable_text, explanation, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?)`
    ).run(`confusable_${wordId}_${index}`, wordId, confusable.trim(), now, now);
  }
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}

export function reconcileEarnedVocabularyMastery(db: DatabaseSync, now: string): void {
  const rows = db
    .prepare(
      `SELECT *
       FROM learner_word_state
       WHERE attempt_count > 0`
    )
    .all() as unknown as Array<LearnerWordStateRow>;
  if (rows.length === 0) return;

  const attemptsByKey = new Map<string, AttemptRecord[]>();
  const attemptRows = db
    .prepare(
      `SELECT learner_id, word_id, created_at, is_correct, hint_level_used
       FROM practice_attempts
       ORDER BY created_at ASC`
    )
    .all() as Array<{
    learner_id: string;
    word_id: string;
    created_at: string;
    is_correct: number;
    hint_level_used: number;
  }>;
  for (const attempt of attemptRows) {
    const key = `${attempt.learner_id}\u0000${attempt.word_id}`;
    const list = attemptsByKey.get(key) ?? [];
    list.push({
      answeredAt: attempt.created_at,
      isCorrect: attempt.is_correct === 1,
      hintLevelUsed: attempt.hint_level_used
    });
    attemptsByKey.set(key, list);
  }

  const update = db.prepare(
    `UPDATE learner_word_state
     SET mastery_colour = ?, updated_at = ?
     WHERE learner_id = ? AND word_id = ?`
  );
  for (const row of rows) {
    const state = mapLearnerWordState(row);
    const attempts = attemptsByKey.get(`${row.learner_id}\u0000${row.word_id}`) ?? null;
    const earned = scoreFromState(state, attempts).colour ?? "red";
    if (masteryRank(earned) <= masteryRank(state.masteryColour)) continue;
    update.run(earned, now, row.learner_id, row.word_id);
  }
}

interface LearnerWordStateRow {
  id: string;
  learner_id: string;
  word_id: string;
  stability_days: number;
  mastery_colour: MasteryColour;
  last_seen_at: string | null;
  last_correct_at: string | null;
  last_wrong_at: string | null;
  next_review_at: string | null;
  attempt_count: number;
  correct_count: number;
  wrong_count: number;
  last_hint_level_used: number | null;
  average_hint_level_used: number;
  average_response_time_ms: number;
  failure_types_json: string;
  confused_with_word_ids_json: string;
  near_review: number;
  eligible_questions_since_last_mistake: number;
  recovery_debt: number;
  last_practiced_at: string | null;
  last_clean_retrieval_at: string | null;
  last_supported_success_at: string | null;
  last_revealed_at: string | null;
  last_exposed_at: string | null;
  last_practiced_session_id: string | null;
  last_practiced_interaction_index: number | null;
  learner_state_content_version: number;
}

function mapLearnerWordState(row: LearnerWordStateRow): LearnerWordState {
  return {
    id: row.id,
    learnerId: row.learner_id,
    wordId: row.word_id,
    stabilityDays: row.stability_days,
    masteryColour: row.mastery_colour,
    lastSeenAt: row.last_seen_at,
    lastCorrectAt: row.last_correct_at,
    lastWrongAt: row.last_wrong_at,
    nextReviewAt: row.next_review_at,
    attemptCount: row.attempt_count,
    correctCount: row.correct_count,
    wrongCount: row.wrong_count,
    lastHintLevelUsed: row.last_hint_level_used,
    averageHintLevelUsed: row.average_hint_level_used,
    averageResponseTimeMs: row.average_response_time_ms,
    failureTypes: parseJsonArray(row.failure_types_json) as LearnerWordState["failureTypes"],
    confusedWithWordIds: parseJsonArray(row.confused_with_word_ids_json),
    nearReview: row.near_review === 1,
    eligibleQuestionsSinceLastMistake: row.eligible_questions_since_last_mistake,
    recoveryDebt: row.recovery_debt,
    lastPracticedAt: row.last_practiced_at,
    lastCleanRetrievalAt: row.last_clean_retrieval_at,
    lastSupportedSuccessAt: row.last_supported_success_at,
    lastRevealedAt: row.last_revealed_at,
    lastExposedAt: row.last_exposed_at,
    lastPracticedSessionId: row.last_practiced_session_id,
    lastPracticedInteractionIndex: row.last_practiced_interaction_index,
    learnerStateContentVersion: row.learner_state_content_version
  };
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function masteryRank(colour: MasteryColour): number {
  switch (colour) {
    case "red":
      return 0;
    case "orange":
      return 1;
    case "yellow":
      return 2;
    case "light_green":
      return 3;
    case "green":
      return 4;
  }
}

function upsertSeedSpellingItem(db: DatabaseSync, entry: SpellingSeedEntry, now: string): void {
  const normalized = normalizeWord(entry.target);
  const itemId = deterministicSpellingItemId(normalized);

  db.prepare(
    `INSERT INTO spelling_items
      (id, target_word, normalized_target, difficulty_level, source, status, teaching_note, study_group, usage_label, common_misspelling, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'seed', 'active', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(normalized_target) DO UPDATE SET
       target_word = CASE WHEN spelling_items.source = 'parent' THEN spelling_items.target_word ELSE excluded.target_word END,
       difficulty_level = CASE WHEN spelling_items.source = 'parent' THEN spelling_items.difficulty_level ELSE excluded.difficulty_level END,
       teaching_note = CASE WHEN spelling_items.source = 'parent' THEN spelling_items.teaching_note ELSE excluded.teaching_note END,
       study_group = CASE WHEN spelling_items.source = 'parent' THEN spelling_items.study_group ELSE excluded.study_group END,
       usage_label = CASE WHEN spelling_items.source = 'parent' THEN spelling_items.usage_label ELSE excluded.usage_label END,
       common_misspelling = CASE WHEN spelling_items.source = 'parent' THEN spelling_items.common_misspelling ELSE excluded.common_misspelling END,
       status = CASE WHEN spelling_items.source = 'parent' THEN spelling_items.status ELSE excluded.status END,
       updated_at = excluded.updated_at`
  ).run(
    itemId,
    entry.target.trim(),
    normalized,
    clampDifficulty(entry.difficulty),
    (entry.teachingNote ?? "").trim(),
    (entry.studyGroup ?? normalized).trim(),
    (entry.usageLabel ?? "").trim(),
    (entry.commonMisspelling ?? "").trim() || null,
    now,
    now
  );

  const owner = db.prepare("SELECT source FROM spelling_items WHERE id = ?").get(itemId) as { source: string } | undefined;
  if (owner?.source === "parent") return;

  const sentences = uniqueTexts(entry.sentences);
  const intendedIds = sentences.map((_, index) => `spelling_prompt_${itemId}_${index}`);
  if (intendedIds.length > 0) {
    const placeholders = intendedIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM spelling_prompts WHERE item_id = ? AND source = 'canonical' AND id NOT IN (${placeholders})`).run(
      itemId,
      ...intendedIds
    );
  } else {
    db.prepare("DELETE FROM spelling_prompts WHERE item_id = ? AND source = 'canonical'").run(itemId);
  }

  for (const [index, sentence] of sentences.entries()) {
    db.prepare(
      `INSERT INTO spelling_prompts
        (id, item_id, sentence, source, status, created_at, updated_at)
       VALUES (?, ?, ?, 'canonical', 'approved', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         sentence = excluded.sentence,
         status = excluded.status,
         updated_at = excluded.updated_at`
    ).run(`spelling_prompt_${itemId}_${index}`, itemId, sentence, now, now);
  }
}

function replaceRows(db: DatabaseSync, table: string, wordId: string): void {
  db.prepare(`DELETE FROM ${table} WHERE word_id = ?`).run(wordId);
}

function reconcileSeedExamples(db: DatabaseSync, wordId: string, examples: string[], now: string): void {
  const intendedIds = examples.map((_, index) => `example_${wordId}_${index}`);
  if (intendedIds.length > 0) {
    const placeholders = intendedIds.map(() => "?").join(", ");
    db.prepare(`DELETE FROM word_examples WHERE word_id = ? AND source = 'canonical' AND id NOT IN (${placeholders})`).run(
      wordId,
      ...intendedIds
    );
  } else {
    db.prepare("DELETE FROM word_examples WHERE word_id = ? AND source = 'canonical'").run(wordId);
  }

  for (const [index, example] of examples.entries()) {
    const exampleId = `example_${wordId}_${index}`;
    const existing = db.prepare("SELECT sentence FROM word_examples WHERE id = ?").get(exampleId) as
      | { sentence: string }
      | undefined;
    if (existing && existing.sentence !== example) {
      db.prepare(
        `UPDATE example_visual_cues
         SET status = 'disabled', updated_at = ?
         WHERE example_id = ? AND status IN ('draft', 'approved')`
      ).run(now, exampleId);
    }
    db.prepare(
      `INSERT INTO word_examples
        (id, word_id, sentence, source, status, created_at, updated_at)
       VALUES (?, ?, ?, 'canonical', 'approved', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         sentence = excluded.sentence,
         source = excluded.source,
         status = excluded.status,
         updated_at = excluded.updated_at`
    ).run(exampleId, wordId, example, now, now);
  }
}

function upsertSeedExampleVisualCues(db: DatabaseSync, now: string): void {
  const assets = listCommittedExampleCueAssets();
  for (const asset of assets) {
    const example = db.prepare("SELECT word_id FROM word_examples WHERE id = ? AND status = 'approved'").get(asset.exampleId) as
      | { word_id: string }
      | undefined;
    if (!example) continue;

    db.prepare(
      `INSERT INTO example_visual_cues
        (id, example_id, word_id, provider, model, prompt_version, prompt, image_path, image_url, status, reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, NULL, ?, NULL, 'approved', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         word_id = excluded.word_id,
         provider = excluded.provider,
         prompt_version = excluded.prompt_version,
         image_path = excluded.image_path,
         image_url = NULL,
         status = CASE
           WHEN example_visual_cues.status IN ('rejected', 'disabled') THEN example_visual_cues.status
           ELSE excluded.status
         END,
         reviewed_at = CASE
           WHEN example_visual_cues.status IN ('rejected', 'disabled') THEN example_visual_cues.reviewed_at
           ELSE COALESCE(example_visual_cues.reviewed_at, excluded.reviewed_at)
         END,
         updated_at = excluded.updated_at`
    ).run(
      `seed_cue_${asset.exampleId}`,
      asset.exampleId,
      example.word_id,
      SEEDED_VISUAL_CUE_PROVIDER,
      SEEDED_VISUAL_CUE_PROMPT_VERSION,
      asset.imagePath,
      now,
      now,
      now
    );
  }
}

function listCommittedExampleCueAssets(): Array<{ exampleId: string; imagePath: string }> {
  const root = path.join(process.cwd(), "public", "assets", "example-cues");
  if (!existsSync(root)) return [];

  const byExampleId = new Map<string, string>();
  const wordDirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("word_"))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const dir of wordDirs) {
    const dirPath = path.join(root, dir.name);
    const files = readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));

    for (const file of files) {
      const match = /^(example_word_[a-z0-9_]+_\d+)-.+\.(?:jpe?g|png|webp)$/i.exec(file);
      if (!match) continue;
      const exampleId = match[1];
      byExampleId.set(exampleId, path.join("public", "assets", "example-cues", dir.name, file).replaceAll(path.sep, "/"));
    }
  }

  return Array.from(byExampleId, ([exampleId, imagePath]) => ({ exampleId, imagePath }));
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function readSeedPack(): SeedPack {
  const seedPath = path.join(process.cwd(), "data", "vocabulary", "mvp-seed-vocabulary.json");
  return JSON.parse(readFileSync(seedPath, "utf8")) as SeedPack;
}

function readSpellingSeedPack(): SpellingSeedPack {
  const seedPath = path.join(process.cwd(), "data", "vocabulary", "spelling-seed.json");
  return JSON.parse(readFileSync(seedPath, "utf8")) as SpellingSeedPack;
}

export function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

export function deterministicWordId(normalizedWord: string): string {
  return `word_${normalizedWord.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function deterministicSpellingItemId(normalizedTarget: string): string {
  return `spelling_${normalizedTarget.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(5, Math.round(value)));
}
