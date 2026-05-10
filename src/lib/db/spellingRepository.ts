import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  assessSpellingAnswer,
  buildSpellingQuestion,
  type SpellingPracticeItem,
  type SpellingQuestion
} from "../learning/spelling";
import { getDb } from "./index";
import { defaultLearnerId, normalizeWord } from "./seed";

interface SpellingSessionRow {
  id: string;
  learner_id: string;
  status: "in_progress" | "completed" | "abandoned";
  target_item_count: number;
  actual_question_count: number;
  item_ids_json: string;
  intro_completed_at: string | null;
  started_at: string;
  ended_at: string | null;
  summary_json: string;
  created_at: string;
  updated_at: string;
}

export interface SpellingPreview {
  targetItemCount: number;
  items: Array<{
    id: string;
    target: string;
    promptCount: number;
    attemptCount: number;
    correctCount: number;
    wrongCount: number;
  }>;
}

export interface ParentSpellingItemInput {
  target: string;
  pairedTarget?: string;
  usageLabel?: string;
  teachingNote: string;
  sentences: string[];
  difficultyLevel?: number;
}

export interface ParentSpellingListItem {
  id: string;
  target: string;
  usageLabel: string;
  teachingNote: string;
  studyGroup: string;
  source: string;
  promptCount: number;
  attemptCount: number;
  wrongCount: number;
}

export interface ParentSpellingEditItem {
  id: string;
  target: string;
  pairedTarget: string;
  usageLabel: string;
  teachingNote: string;
  sentences: string[];
}

export interface SpellingSessionView {
  sessionId: string;
  status: "in_progress" | "completed" | "abandoned";
  phase: "intro" | "practice" | "completed";
  questionNumber: number;
  totalQuestions: number;
  studyGroups: Array<{
    id: string;
    title: string;
    items: SpellingStudyItem[];
  }>;
  wordBank: string[];
  question: SpellingQuestion | null;
  lastResult: {
    isCorrect: boolean;
    submittedAnswer: string;
    correctAnswer: string;
    selectedTokenIndex: number | null;
    correctTokenIndex: number | null;
    question: SpellingQuestion;
    completed: boolean;
  } | null;
}

interface SpellingStudyItem {
  id: string;
  target: string;
  usageLabel: string;
  teachingNote: string;
  example: string;
}

export type SubmitSpellingAnswerResult = {
  completed: boolean;
  isCorrect: boolean | null;
  attemptId: string | null;
};

export function getSpellingPreview(targetItemCount = 8): SpellingPreview {
  const db = getDb();
  const existing = getLatestInProgressSpellingSession(db);
  const items = existing
    ? getSpellingItemsByIds(db, readJsonStringArray(existing.item_ids_json))
    : selectSpellingItems(db, targetItemCount);
  const stats = getSpellingStatsByItem(db);

  return {
    targetItemCount: items.length,
    items: items.map((item) => {
      const itemStats = stats.get(item.id) ?? { attempts: 0, correct: 0, wrong: 0 };
      return {
        id: item.id,
        target: item.target,
        promptCount: item.prompts.length,
        attemptCount: itemStats.attempts,
        correctCount: itemStats.correct,
        wrongCount: itemStats.wrong
      };
    })
  };
}

export function getParentSpellingItems(): ParentSpellingListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.id,
              i.target_word,
              i.usage_label,
              i.teaching_note,
              i.study_group,
              i.source,
              COUNT(DISTINCT p.id) AS prompt_count,
              COUNT(DISTINCT a.id) AS attempt_count,
              SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count
       FROM spelling_items i
       LEFT JOIN spelling_prompts p ON p.item_id = i.id AND p.status = 'approved'
       LEFT JOIN spelling_attempts a ON a.item_id = i.id AND a.learner_id = ?
       WHERE i.status = 'active'
       GROUP BY i.id
       ORDER BY i.study_group ASC, i.target_word ASC`
    )
    .all(defaultLearnerId()) as Array<{
    id: string;
    target_word: string;
    usage_label: string;
    teaching_note: string;
    study_group: string;
    source: string;
    prompt_count: number;
    attempt_count: number;
    wrong_count: number | null;
  }>;

  return rows.map((row) => ({
      id: row.id,
      target: row.target_word,
      usageLabel: row.usage_label,
      teachingNote: row.teaching_note,
      studyGroup: row.study_group,
      source: row.source,
      promptCount: row.prompt_count,
      attemptCount: row.attempt_count,
      wrongCount: row.wrong_count ?? 0
    }));
}

export function getParentSpellingItemForEdit(itemId: string): ParentSpellingEditItem | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, target_word, usage_label, teaching_note, study_group
       FROM spelling_items
       WHERE id = ? AND status = 'active'`
    )
    .get(itemId) as
    | { id: string; target_word: string; usage_label: string; teaching_note: string; study_group: string }
    | undefined;
  if (!row) return null;

  const prompts = getSpellingPrompts(db, row.id).map((prompt) => prompt.sentence);
  const pairedTarget = getSpellingConfusables(db, row.study_group || row.id, row.id)[0] ?? "";

  return {
    id: row.id,
    target: row.target_word,
    pairedTarget,
    usageLabel: row.usage_label,
    teachingNote: row.teaching_note,
    sentences: prompts.length > 0 ? prompts : [""]
  };
}

export function createOrUpdateParentSpellingItem(input: ParentSpellingItemInput): string {
  const db = getDb();
  const now = new Date().toISOString();
  const normalizedTarget = normalizeWord(input.target);
  if (!normalizedTarget) throw new Error("Target word is required.");

  const normalizedPair = normalizeWord(input.pairedTarget ?? "");
  const studyGroup = spellingStudyGroup(normalizedTarget, normalizedPair);
  const itemId = deterministicSpellingItemId(normalizedTarget);
  const sentences = uniqueTexts(input.sentences);
  if (sentences.length === 0) throw new Error("At least one sentence is required.");

  upsertParentSpellingShell(db, {
    itemId,
    target: input.target.trim(),
    normalizedTarget,
    studyGroup,
    usageLabel: input.usageLabel ?? "",
    teachingNote: input.teachingNote,
    difficultyLevel: input.difficultyLevel,
    ownsContent: true,
    now
  });

  if (normalizedPair) {
    upsertParentSpellingShell(db, {
      itemId: deterministicSpellingItemId(normalizedPair),
      target: input.pairedTarget?.trim() ?? normalizedPair,
      normalizedTarget: normalizedPair,
      studyGroup,
      usageLabel: "",
      teachingNote: "",
      difficultyLevel: input.difficultyLevel,
      ownsContent: false,
      now
    });
  }

  replaceParentSpellingPrompts(db, itemId, sentences, now);
  return itemId;
}

export function startSpellingMission(targetItemCount = 8): string {
  const db = getDb();
  const existing = getLatestInProgressSpellingSession(db);
  if (existing) return existing.id;

  const items = selectSpellingItems(db, targetItemCount);
  if (items.length === 0) {
    throw new Error("No spelling items are available for practice.");
  }

  const now = new Date().toISOString();
  const sessionId = randomUUID();
  const itemIds = items.map((item) => item.id);
  const summary = {
    itemIds,
    correctWords: [],
    missedWords: []
  };

  db.prepare(
    `INSERT INTO spelling_sessions
      (id, learner_id, status, target_item_count, actual_question_count, item_ids_json,
       started_at, summary_json, created_at, updated_at)
     VALUES (?, ?, 'in_progress', ?, 0, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    defaultLearnerId(),
    itemIds.length,
    JSON.stringify(itemIds),
    now,
    JSON.stringify(summary),
    now,
    now
  );

  return sessionId;
}

export function getSpellingSessionView(sessionId: string, attemptId?: string): SpellingSessionView {
  const db = getDb();
  const session = getSpellingSessionRow(db, sessionId);
  const itemIds = readJsonStringArray(session.item_ids_json);
  const resolvedQuestions = getResolvedSpellingQuestionCount(db, sessionId);
  const sessionItems = getSpellingItemsByIds(db, itemIds);
  const currentItemId = itemIds[resolvedQuestions];
  const currentItem = currentItemId ? sessionItems.find((item) => item.id === currentItemId) ?? null : null;

  const phase = spellingSessionPhase(session);
  const lastResult = attemptId ? getSpellingAttemptResult(db, sessionId, attemptId) : null;
  const showingSolvedAttempt = lastResult?.isCorrect === true;

  return {
    sessionId,
    status: session.status,
    phase,
    questionNumber: Math.min(resolvedQuestions + (showingSolvedAttempt ? 0 : 1), itemIds.length),
    totalQuestions: itemIds.length,
    studyGroups: groupSpellingStudyItems(sessionItems),
    wordBank: sessionItems.map((item) => item.target),
    question:
      lastResult?.question ??
      (phase === "practice" && currentItem
        ? buildSpellingQuestion(currentItem, resolvedQuestions, sessionItems)
        : null),
    lastResult
  };
}

export function startSpellingPractice(sessionId: string): void {
  const db = getDb();
  const session = getSpellingSessionRow(db, sessionId);
  if (session.status !== "in_progress" || session.intro_completed_at) return;
  const now = new Date().toISOString();
  db.prepare("UPDATE spelling_sessions SET intro_completed_at = ?, updated_at = ? WHERE id = ?").run(now, now, sessionId);
}

export function submitSpellingAnswer(input: {
  sessionId: string;
  submittedAnswer: string;
  responseTimeMs: number;
}): SubmitSpellingAnswerResult {
  const db = getDb();
  const session = getSpellingSessionRow(db, input.sessionId);
  if (session.status !== "in_progress") return { completed: true, isCorrect: null, attemptId: null };
  if (!session.intro_completed_at) {
    throw new Error("Spelling intro must be completed before answering.");
  }

  const itemIds = readJsonStringArray(session.item_ids_json);
  const resolvedQuestions = getResolvedSpellingQuestionCount(db, session.id);
  const itemId = itemIds[resolvedQuestions];
  if (!itemId) {
    completeSpellingSession(db, session.id);
    return { completed: true, isCorrect: null, attemptId: null };
  }

  const sessionItems = getSpellingItemsByIds(db, itemIds);
  const item = sessionItems.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error(`Spelling item ${itemId} is not available.`);

  const question = buildSpellingQuestion(item, resolvedQuestions, sessionItems);
  const assessment = assessSpellingAnswer(question, input.submittedAnswer);
  const now = new Date().toISOString();
  const attemptId = randomUUID();

  db.prepare(
    `INSERT INTO spelling_attempts
      (id, session_id, learner_id, item_id, prompt_id, prompt_json, expected_answer_json,
       submitted_answer, is_correct, response_time_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    session.id,
    defaultLearnerId(),
    item.id,
    question.promptId,
    JSON.stringify(question),
    JSON.stringify({
      expectedSelection: question.expectedSelection,
      canonicalAnswer: question.target,
      correctTokenIndex: question.correctTokenIndex,
      issueKind: question.issueKind
    }),
    input.submittedAnswer,
    assessment.isCorrect ? 1 : 0,
    Number.isFinite(input.responseTimeMs) ? input.responseTimeMs : 0,
    now
  );

  const actualCount = assessment.isCorrect ? resolvedQuestions + 1 : resolvedQuestions;
  const completed = assessment.isCorrect && actualCount >= itemIds.length;
  if (completed) {
    completeSpellingSession(db, session.id);
  } else {
    db.prepare("UPDATE spelling_sessions SET actual_question_count = ?, updated_at = ? WHERE id = ?").run(
      actualCount,
      now,
      session.id
    );
  }

  return { completed, isCorrect: assessment.isCorrect, attemptId };
}

function readJsonStringArray(value: string): string[] {
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
}

function getLatestInProgressSpellingSession(db: DatabaseSync): SpellingSessionRow | null {
  const row = db
    .prepare(
      `SELECT *
       FROM spelling_sessions
       WHERE learner_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC, created_at DESC
       LIMIT 1`
    )
    .get(defaultLearnerId()) as SpellingSessionRow | undefined;
  return row ?? null;
}

function getSpellingSessionRow(db: DatabaseSync, sessionId: string): SpellingSessionRow {
  const row = db.prepare("SELECT * FROM spelling_sessions WHERE id = ?").get(sessionId) as
    | SpellingSessionRow
    | undefined;
  if (!row) throw new Error(`Spelling session ${sessionId} was not found.`);
  return row;
}

function getResolvedSpellingQuestionCount(db: DatabaseSync, sessionId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT item_id) AS count
         FROM spelling_attempts
         WHERE session_id = ? AND is_correct = 1`
      )
      .get(sessionId) as { count: number }
  ).count;
}

function getSpellingAttemptResult(
  db: DatabaseSync,
  sessionId: string,
  attemptId: string
): SpellingSessionView["lastResult"] {
  const row = db
    .prepare(
      `SELECT a.submitted_answer, a.is_correct, a.prompt_json, a.expected_answer_json
       FROM spelling_attempts a
       WHERE a.session_id = ? AND a.id = ?`
    )
    .get(sessionId, attemptId) as
    | { submitted_answer: string; is_correct: number; prompt_json: string; expected_answer_json: string }
    | undefined;
  if (!row) return null;
  const question = JSON.parse(row.prompt_json) as SpellingQuestion;
  const expected = JSON.parse(row.expected_answer_json) as {
    canonicalAnswer?: string;
    expectedSelection?: string;
    correctTokenIndex?: number | null;
  };
  const assessment = selectionMetadata(row.submitted_answer);
  return {
    isCorrect: row.is_correct === 1,
    submittedAnswer: row.submitted_answer,
    correctAnswer: expected.canonicalAnswer ?? "",
    selectedTokenIndex: assessment.selectedTokenIndex,
    correctTokenIndex: expected.correctTokenIndex ?? question.correctTokenIndex,
    question,
    completed: row.is_correct === 1 && spellingAttemptCompletesSession(db, sessionId, attemptId)
  };
}

function spellingSessionPhase(session: SpellingSessionRow): SpellingSessionView["phase"] {
  if (session.status === "completed") return "completed";
  return session.intro_completed_at ? "practice" : "intro";
}

function selectSpellingItems(db: DatabaseSync, limit: number): SpellingPracticeItem[] {
  const rows = db
    .prepare(
      `SELECT i.id
       FROM spelling_items i
       LEFT JOIN (
         SELECT item_id,
                COUNT(*) AS attempts,
                SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong,
                MAX(created_at) AS last_attempt_at
         FROM spelling_attempts
         WHERE learner_id = ?
         GROUP BY item_id
       ) stats ON stats.item_id = i.id
       WHERE i.status = 'active'
         AND EXISTS (
           SELECT 1 FROM spelling_prompts p
           WHERE p.item_id = i.id AND p.status = 'approved'
         )
       ORDER BY COALESCE(stats.wrong, 0) DESC,
                COALESCE(stats.attempts, 0) ASC,
                COALESCE(stats.last_attempt_at, '') ASC,
                i.study_group ASC,
                i.target_word ASC
       LIMIT ?`
    )
    .all(defaultLearnerId(), limit) as Array<{ id: string }>;
  return getSpellingItemsByIds(db, rows.map((row) => row.id));
}

function getSpellingItemsByIds(db: DatabaseSync, itemIds: string[]): SpellingPracticeItem[] {
  if (itemIds.length === 0) return [];
  const placeholders = itemIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, target_word, teaching_note, study_group, usage_label
       FROM spelling_items
       WHERE id IN (${placeholders}) AND status = 'active'`
    )
    .all(...itemIds) as Array<{
      id: string;
      target_word: string;
      teaching_note: string;
      study_group: string;
      usage_label: string;
    }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return itemIds.flatMap((itemId) => {
    const row = byId.get(itemId);
    if (!row) return [];
    return [
      {
        id: row.id,
        target: row.target_word,
        teachingNote: row.teaching_note,
        studyGroup: row.study_group || row.id,
        usageLabel: row.usage_label,
        confusables: getSpellingConfusables(db, row.study_group || row.id, row.id),
        prompts: getSpellingPrompts(db, row.id)
      }
    ];
  });
}

function groupSpellingStudyItems(items: SpellingPracticeItem[]): SpellingSessionView["studyGroups"] {
  const groups = new Map<string, SpellingStudyItem[]>();
  for (const item of items) {
    const key = item.studyGroup || item.id;
    const groupItems = groups.get(key) ?? [];
    groupItems.push({
      id: item.id,
      target: item.target,
      usageLabel: item.usageLabel,
      teachingNote: item.teachingNote,
      example: item.prompts[0]?.sentence ?? ""
    });
    groups.set(key, groupItems);
  }

  return [...groups.entries()].map(([id, groupItems]) => ({
    id,
    title: groupItems.map((item) => item.target).join(" / "),
    items: groupItems
  }));
}

function getSpellingPrompts(db: DatabaseSync, itemId: string): SpellingPracticeItem["prompts"] {
  return db
    .prepare(
      `SELECT id, sentence
       FROM spelling_prompts
       WHERE item_id = ? AND status = 'approved'
       ORDER BY id ASC`
    )
    .all(itemId) as SpellingPracticeItem["prompts"];
}

function getSpellingConfusables(db: DatabaseSync, studyGroup: string, itemId: string): string[] {
  if (!studyGroup) return [];
  const rows = db
    .prepare(
      `SELECT target_word
       FROM spelling_items
       WHERE study_group = ? AND id <> ? AND status = 'active'
       ORDER BY target_word ASC`
    )
    .all(studyGroup, itemId) as Array<{ target_word: string }>;
  return rows.map((row) => row.target_word);
}

function getSpellingStatsByItem(db: DatabaseSync): Map<string, { attempts: number; correct: number; wrong: number }> {
  const rows = db
    .prepare(
      `SELECT item_id,
              COUNT(*) AS attempts,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
              SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong
       FROM spelling_attempts
       WHERE learner_id = ?
       GROUP BY item_id`
    )
    .all(defaultLearnerId()) as Array<{ item_id: string; attempts: number; correct: number; wrong: number }>;
  return new Map(
    rows.map((row) => [
      row.item_id,
      {
        attempts: row.attempts,
        correct: row.correct,
        wrong: row.wrong
      }
    ])
  );
}

function completeSpellingSession(db: DatabaseSync, sessionId: string): void {
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT i.target_word,
              MAX(a.is_correct) AS solved,
              SUM(CASE WHEN a.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_attempts
       FROM spelling_attempts a
       JOIN spelling_items i ON i.id = a.item_id
       WHERE a.session_id = ?
       GROUP BY i.id, i.target_word
       ORDER BY MIN(a.created_at) ASC, i.target_word ASC`
    )
    .all(sessionId) as Array<{ target_word: string; solved: number; wrong_attempts: number }>;
  const summary = {
    correctWords: rows.filter((row) => row.solved === 1 && row.wrong_attempts === 0).map((row) => row.target_word),
    missedWords: rows.filter((row) => row.wrong_attempts > 0).map((row) => row.target_word)
  };
  db.prepare(
    `UPDATE spelling_sessions
     SET status = 'completed',
         actual_question_count = (SELECT COUNT(DISTINCT item_id) FROM spelling_attempts WHERE session_id = ? AND is_correct = 1),
         ended_at = ?,
         summary_json = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(sessionId, now, JSON.stringify(summary), now, sessionId);
}

function selectionMetadata(selection: string): { normalizedSubmitted: string; selectedTokenIndex: number | null } {
  const normalizedSubmitted = selection.trim().toLocaleLowerCase("en-GB");
  const match = /^word:(\d+)$/.exec(normalizedSubmitted);
  return {
    normalizedSubmitted,
    selectedTokenIndex: match ? Number(match[1]) : null
  };
}

function spellingAttemptCompletesSession(db: DatabaseSync, sessionId: string, attemptId: string): boolean {
  const session = getSpellingSessionRow(db, sessionId);
  if (session.status === "completed") return true;
  const itemIds = readJsonStringArray(session.item_ids_json);
  const attempt = db
    .prepare("SELECT item_id, is_correct FROM spelling_attempts WHERE session_id = ? AND id = ?")
    .get(sessionId, attemptId) as { item_id: string; is_correct: number } | undefined;
  if (!attempt || attempt.is_correct !== 1) return false;
  return getResolvedSpellingQuestionCount(db, sessionId) >= itemIds.length;
}

function upsertParentSpellingShell(
  db: DatabaseSync,
  input: {
    itemId: string;
    target: string;
    normalizedTarget: string;
    studyGroup: string;
    usageLabel: string;
    teachingNote: string;
    difficultyLevel?: number;
    ownsContent: boolean;
    now: string;
  }
): void {
  db.prepare(
    `INSERT INTO spelling_items
      (id, target_word, normalized_target, difficulty_level, source, status, teaching_note, study_group, usage_label, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'parent', 'active', ?, ?, ?, ?, ?)
     ON CONFLICT(normalized_target) DO UPDATE SET
       target_word = excluded.target_word,
       difficulty_level = excluded.difficulty_level,
       source = CASE WHEN ? = 1 THEN 'parent' ELSE spelling_items.source END,
       status = 'active',
       teaching_note = CASE WHEN excluded.teaching_note <> '' THEN excluded.teaching_note ELSE spelling_items.teaching_note END,
       study_group = excluded.study_group,
       usage_label = CASE WHEN excluded.usage_label <> '' THEN excluded.usage_label ELSE spelling_items.usage_label END,
       updated_at = excluded.updated_at`
  ).run(
    input.itemId,
    input.target,
    input.normalizedTarget,
    clampDifficulty(input.difficultyLevel ?? 2),
    input.teachingNote.trim(),
    input.studyGroup,
    input.usageLabel.trim(),
    input.now,
    input.now,
    input.ownsContent ? 1 : 0
  );
}

function replaceParentSpellingPrompts(db: DatabaseSync, itemId: string, sentences: string[], now: string): void {
  db.prepare("DELETE FROM spelling_prompts WHERE item_id = ?").run(itemId);
  for (const [index, sentence] of sentences.entries()) {
    db.prepare(
      `INSERT INTO spelling_prompts
        (id, item_id, sentence, source, status, created_at, updated_at)
       VALUES (?, ?, ?, 'parent', 'approved', ?, ?)`
    ).run(`spelling_prompt_${itemId}_parent_${index}`, itemId, sentence, now, now);
  }
}

function spellingStudyGroup(normalizedTarget: string, normalizedPair: string): string {
  return (normalizedPair ? [normalizedTarget, normalizedPair].sort() : [normalizedTarget])
    .join("_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function deterministicSpellingItemId(normalizedTarget: string): string {
  return `spelling_${normalizedTarget.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
}

function uniqueTexts(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const key = clean.toLocaleLowerCase("en-GB");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function clampDifficulty(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(5, Math.round(value)));
}
