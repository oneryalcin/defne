import { readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync } from "node:sqlite";

const DEFAULT_LEARNER_ID = "learner_defne";

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

export function seedInitialData(db: DatabaseSync): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO learners (id, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?)`
  ).run(DEFAULT_LEARNER_ID, "Defne", now, now);

  db.prepare(
    `INSERT OR IGNORE INTO learner_profiles
      (learner_id, year_group, locale, interests_json, avatar_style, avatar_traits_json, created_at, updated_at)
     VALUES (?, 'Year 5', 'en-GB', ?, 'pencil_drawing', ?, ?, ?)`
  ).run(DEFAULT_LEARNER_ID, JSON.stringify(["stories", "drawing", "word games"]), JSON.stringify({ style: "warm pencil sketch" }), now, now);

  const seedPack = readSeedPack();
  for (const entry of seedPack.entries) {
    upsertSeedWord(db, entry, now);
  }

  const wordRows = db.prepare("SELECT id FROM words WHERE status = 'active'").all() as Array<{ id: string }>;
  for (const row of wordRows) {
    db.prepare(
      `INSERT OR IGNORE INTO learner_word_state
        (id, learner_id, word_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(`state_${DEFAULT_LEARNER_ID}_${row.id}`, DEFAULT_LEARNER_ID, row.id, now, now);
  }
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

export function normalizeWord(word: string): string {
  return word.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

export function deterministicWordId(normalizedWord: string): string {
  return `word_${normalizedWord.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(5, Math.round(value)));
}
