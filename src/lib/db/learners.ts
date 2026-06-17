import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb } from "./index";
import { defaultLearnerId, normalizeWord } from "./seed";

export interface LearnerSummary {
  id: string;
  displayName: string;
  yearGroup: string;
  locale: string;
  vocabularyCount: number;
  spellingCount: number;
}

export interface LearnerAccess {
  accessCode: string;
  learnerId: string;
  displayName: string;
}

export interface CreateLearnerInput {
  displayName: string;
  accessCode: string;
  yearGroup?: string;
  locale?: string;
}

export type AssignmentPriorityMode = "normal" | "next_round_once";

export interface ParentVocabularyLibraryItem {
  id: string;
  word: string;
  definition: string | null;
  assigned: boolean;
  priorityMode: AssignmentPriorityMode;
}

export function listLearners(): LearnerSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT l.id,
              l.display_name,
              p.year_group,
              p.locale,
              (SELECT COUNT(*) FROM learner_vocabulary_words lvw WHERE lvw.learner_id = l.id AND lvw.status = 'active') AS vocabulary_count,
              (SELECT COUNT(*) FROM learner_spelling_items lsi WHERE lsi.learner_id = l.id AND lsi.status = 'active') AS spelling_count
       FROM learners l
       LEFT JOIN learner_profiles p ON p.learner_id = l.id
       ORDER BY l.created_at ASC, l.display_name ASC`
    )
    .all() as Array<{
    id: string;
    display_name: string;
    year_group: string | null;
    locale: string | null;
    vocabulary_count: number;
    spelling_count: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    yearGroup: row.year_group ?? "Year 5",
    locale: row.locale ?? "en-GB",
    vocabularyCount: row.vocabulary_count,
    spellingCount: row.spelling_count
  }));
}

export function defaultParentLearnerId(): string {
  return defaultLearnerId();
}

export function resolveSelectedLearnerId(candidate: string | null | undefined): string {
  const db = getDb();
  const requested = candidate?.trim();
  if (requested) {
    const row = db.prepare("SELECT id FROM learners WHERE id = ?").get(requested) as { id: string } | undefined;
    if (row) return row.id;
  }
  return defaultParentLearnerId();
}

export function learnerExists(learnerId: string): boolean {
  return Boolean(getDb().prepare("SELECT id FROM learners WHERE id = ?").get(learnerId));
}

export function vocabularyWordIsActiveForLearner(learnerId: string, wordId: string): boolean {
  return Boolean(
    getDb()
      .prepare(
        `SELECT 1
         FROM learner_vocabulary_words
         WHERE learner_id = ? AND word_id = ? AND status = 'active'`
      )
      .get(learnerId, wordId)
  );
}

export function getLearnerAccessByCode(accessCode: string): LearnerAccess | null {
  const code = normalizeAccessCode(accessCode);
  if (!code) return null;
  const db = getDb();
  const row = db
    .prepare(
      `SELECT a.access_code, a.learner_id, l.display_name
       FROM learner_access_codes a
       JOIN learners l ON l.id = a.learner_id
       WHERE a.access_code = ?`
    )
    .get(code) as { access_code: string; learner_id: string; display_name: string } | undefined;
  return row
    ? {
        accessCode: row.access_code,
        learnerId: row.learner_id,
        displayName: row.display_name
      }
    : null;
}

export function createLearner(input: CreateLearnerInput): string {
  const db = getDb();
  const now = new Date().toISOString();
  const displayName = input.displayName.trim();
  const accessCode = normalizeAccessCode(input.accessCode);
  if (!displayName) throw new Error("Child name is required.");
  if (!accessCode) throw new Error("Child access code is required.");

  const duplicateAccess = db
    .prepare("SELECT learner_id FROM learner_access_codes WHERE access_code = ?")
    .get(accessCode) as { learner_id: string } | undefined;
  if (duplicateAccess) throw new Error("That child access code is already in use.");

  const learnerId = uniqueLearnerId(db, displayName);
  db.prepare("INSERT INTO learners (id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
    learnerId,
    displayName,
    now,
    now
  );
  db.prepare(
    `INSERT INTO learner_profiles
      (learner_id, year_group, locale, interests_json, avatar_style, avatar_traits_json,
       next_round_new_count, next_round_recovery_count, next_round_review_count, next_round_stable_count,
       created_at, updated_at)
     VALUES (?, ?, ?, '[]', 'pencil_drawing', '{}', 6, 3, 3, 0, ?, ?)`
  ).run(learnerId, input.yearGroup?.trim() || "Year 5", input.locale?.trim() || "en-GB", now, now);
  db.prepare("INSERT INTO learner_access_codes (access_code, learner_id, created_at, updated_at) VALUES (?, ?, ?, ?)").run(
    accessCode,
    learnerId,
    now,
    now
  );
  return learnerId;
}

export function assignVocabularyWordToLearner(learnerId: string, wordId: string): void {
  const db = getDb();
  assignVocabularyWordToLearnerInDb(db, learnerId, wordId, new Date().toISOString());
}

export function assignVocabularyWordToLearnerInDb(db: DatabaseSync, learnerId: string, wordId: string, now: string): void {
  db.prepare(
    `INSERT INTO learner_vocabulary_words
       (learner_id, word_id, status, assigned_at, priority_mode, priority_requested_at, priority_consumed_at, created_at, updated_at)
     VALUES (?, ?, 'active', ?, 'normal', NULL, NULL, ?, ?)
     ON CONFLICT(learner_id, word_id) DO UPDATE SET
       status = 'active',
       updated_at = excluded.updated_at`
  ).run(learnerId, wordId, now, now, now);
}

export function unassignVocabularyWordFromLearner(learnerId: string, wordId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE learner_vocabulary_words
       SET status = 'paused',
           priority_mode = 'normal',
           priority_requested_at = NULL,
           updated_at = ?
       WHERE learner_id = ? AND word_id = ?`
    )
    .run(now, learnerId, wordId);
}

export function requestVocabularyWordNextRound(learnerId: string, wordId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE learner_vocabulary_words
       SET priority_mode = 'next_round_once',
           priority_requested_at = ?,
           priority_consumed_at = NULL,
           updated_at = ?
       WHERE learner_id = ? AND word_id = ? AND status = 'active'`
    )
    .run(now, now, learnerId, wordId);
}

export function clearVocabularyWordPriority(learnerId: string, wordId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE learner_vocabulary_words
       SET priority_mode = 'normal',
           priority_requested_at = NULL,
           updated_at = ?
       WHERE learner_id = ? AND word_id = ?`
    )
    .run(now, learnerId, wordId);
}

export function listAvailableVocabularyForLearner(learnerId: string): ParentVocabularyLibraryItem[] {
  const rows = getDb()
    .prepare(
      `SELECT w.id,
              w.word,
              d.definition,
              COALESCE(lvw.priority_mode, 'normal') AS priority_mode,
              CASE WHEN lvw.status = 'active' THEN 1 ELSE 0 END AS assigned
       FROM words w
       LEFT JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       LEFT JOIN learner_vocabulary_words lvw ON lvw.word_id = w.id AND lvw.learner_id = ?
       WHERE w.status = 'active'
       ORDER BY assigned ASC, w.word ASC`
    )
    .all(learnerId) as Array<{
    id: string;
    word: string;
    definition: string | null;
    priority_mode: AssignmentPriorityMode;
    assigned: number;
  }>;
  return rows.map((row) => ({
    id: row.id,
    word: row.word,
    definition: row.definition,
    assigned: row.assigned === 1,
    priorityMode: row.priority_mode
  }));
}

function normalizeAccessCode(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB");
}

function uniqueLearnerId(db: DatabaseSync, displayName: string): string {
  const base = `learner_${normalizeWord(displayName).replace(/[^a-z0-9]+/g, "_") || "child"}`;
  const existing = db.prepare("SELECT id FROM learners WHERE id = ?").get(base) as { id: string } | undefined;
  if (!existing) return base;
  return `${base}_${randomUUID().slice(0, 8)}`;
}
