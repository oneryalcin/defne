import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { assessAnswer, generateQuestion, type PracticeQuestion } from "../learning/questions";
import { selectSessionPlan, updateStateAfterAttempt } from "../learning/mastery";
import type {
  FailureType,
  LearnerWordState,
  PracticeAttemptOutcome,
  PracticeWord,
  QuestionType,
  SessionPlanItem,
  SessionSummary
} from "../types";
import { getDb } from "./index";
import { defaultLearnerId, deterministicWordId, normalizeWord } from "./seed";

interface WordRow {
  id: string;
  word: string;
  normalized_word: string;
  difficulty_level: number;
  definition: string | null;
  example: string | null;
}

interface StateRow {
  id: string;
  learner_id: string;
  word_id: string;
  meaning_mastery: number;
  usage_mastery: number;
  spelling_mastery: number;
  stability_days: number;
  mastery_colour: LearnerWordState["masteryColour"];
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
}

interface SessionRow {
  id: string;
  learner_id: string;
  status: "in_progress" | "completed" | "abandoned";
  target_question_count: number;
  actual_question_count: number;
  started_at: string;
  ended_at: string | null;
  summary_json: string;
}

export interface MissionPreview {
  targetQuestionCount: number;
  words: Array<{
    id: string;
    word: string;
    definition: string;
    masteryColour: LearnerWordState["masteryColour"];
    weakestDimension: string;
  }>;
}

export interface SessionView {
  sessionId: string;
  status: SessionRow["status"];
  questionNumber: number;
  totalQuestions: number;
  question: PracticeQuestion | null;
  word: PracticeWord | null;
}

export interface ParentWordListItem {
  id: string;
  word: string;
  definition: string | null;
  example: string | null;
  masteryColour: LearnerWordState["masteryColour"] | null;
  difficultyLevel: number;
  isComplete: boolean;
}

export interface ParentDashboard {
  totalWords: number;
  completeWords: number;
  latestSession: {
    startedAt: string;
    actualQuestionCount: number;
    summary: SessionSummary;
  } | null;
  redOrangeWords: ParentWordListItem[];
  spellingMistakes: Array<{ word: string; mistakes: number; note: string | null }>;
  dueWords: ParentWordListItem[];
  closeToGreen: ParentWordListItem[];
}

export interface WordFormInput {
  word: string;
  definition?: string;
  example?: string;
  synonym?: string;
  antonym?: string;
  spellingNote?: string;
  confusable?: string;
  difficultyLevel?: number;
}

export function getHomeStatus(): { wordCount: number; completeWordCount: number; learnerName: string } {
  const db = getDb();
  const wordCount = (db.prepare("SELECT COUNT(*) AS count FROM words WHERE status = 'active'").get() as { count: number }).count;
  const completeWordCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM words w
         WHERE w.status = 'active'
           AND EXISTS (SELECT 1 FROM word_definitions d WHERE d.word_id = w.id AND d.is_primary = 1)
           AND EXISTS (SELECT 1 FROM word_examples e WHERE e.word_id = w.id AND e.status = 'approved')`
      )
      .get() as { count: number }
  ).count;
  const learner = db.prepare("SELECT display_name FROM learners WHERE id = ?").get(defaultLearnerId()) as
    | { display_name: string }
    | undefined;
  return { wordCount, completeWordCount, learnerName: learner?.display_name ?? "Learner" };
}

export function getMissionPreview(targetQuestionCount = 15): MissionPreview {
  const words = getPracticeWords();
  const plan = selectSessionPlan(words, new Date().toISOString(), targetQuestionCount);
  const byId = new Map(words.map((word) => [word.id, word]));
  return {
    targetQuestionCount: plan.length,
    words: plan.map((item) => {
      const word = byId.get(item.wordId);
      if (!word) throw new Error(`Missing planned word ${item.wordId}`);
      return {
        id: word.id,
        word: word.word,
        definition: word.definition,
        masteryColour: word.state.masteryColour,
        weakestDimension: weakestDimensionLabel(word.state)
      };
    })
  };
}

export function startDailyMission(targetQuestionCount = 15): string {
  const db = getDb();
  const words = getPracticeWords();
  const plan = selectSessionPlan(words, new Date().toISOString(), targetQuestionCount);
  if (plan.length === 0) {
    throw new Error("No complete vocabulary words are available for a mission.");
  }

  const now = new Date().toISOString();
  const sessionId = randomUUID();
  const summary: SessionSummary = { plan };
  db.prepare(
    `INSERT INTO practice_sessions
      (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, summary_json, created_at, updated_at)
     VALUES (?, ?, 'daily_mission', 'in_progress', ?, 0, ?, ?, ?, ?)`
  ).run(sessionId, defaultLearnerId(), plan.length, now, JSON.stringify(summary), now, now);
  return sessionId;
}

export function getSessionView(sessionId: string): SessionView {
  const db = getDb();
  const session = getSessionRow(db, sessionId);
  const plan = readSessionPlan(session);
  const attempts = getSessionAttemptCount(db, sessionId);
  const words = getPracticeWords();
  const wordMap = new Map(words.map((word) => [word.id, word]));

  if (session.status !== "in_progress" || attempts >= plan.length) {
    return {
      sessionId,
      status: session.status,
      questionNumber: Math.min(attempts, plan.length),
      totalQuestions: plan.length,
      question: null,
      word: null
    };
  }

  const current = plan[attempts];
  const word = wordMap.get(current.wordId);
  if (!word) throw new Error(`Session word ${current.wordId} is not available.`);

  return {
    sessionId,
    status: session.status,
    questionNumber: attempts + 1,
    totalQuestions: plan.length,
    question: generateQuestion(current.questionType, word, words),
    word
  };
}

export function submitSessionAnswer(input: {
  sessionId: string;
  submittedAnswer: string;
  hintLevelUsed: number;
  responseTimeMs: number;
}): { completed: boolean } {
  const db = getDb();
  const session = getSessionRow(db, input.sessionId);
  if (session.status !== "in_progress") return { completed: true };

  const plan = readSessionPlan(session);
  const attemptIndex = getSessionAttemptCount(db, input.sessionId);
  const current = plan[attemptIndex];
  if (!current) {
    completeSession(db, session.id);
    return { completed: true };
  }

  const words = getPracticeWords();
  const word = words.find((candidate) => candidate.id === current.wordId);
  if (!word) throw new Error(`Session word ${current.wordId} is not available.`);

  const question = generateQuestion(current.questionType, word, words);
  const assessment = assessAnswer(question, input.submittedAnswer);
  const now = new Date().toISOString();
  const outcome: PracticeAttemptOutcome = {
    questionType: current.questionType,
    isCorrect: assessment.isCorrect,
    hintLevelUsed: input.hintLevelUsed,
    maxHintLevelAvailable: question.hints.length,
    responseTimeMs: input.responseTimeMs,
    failureType: assessment.failureType,
    answeredAt: now
  };

  db.prepare(
    `INSERT INTO practice_attempts
      (id, session_id, learner_id, word_id, question_type, prompt_json, expected_answer_json,
       submitted_answer, is_correct, hint_level_used, max_hint_level_available, response_time_ms, failure_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    randomUUID(),
    session.id,
    defaultLearnerId(),
    word.id,
    current.questionType,
    JSON.stringify({ prompt: question.prompt, instruction: question.instruction, choices: question.choices }),
    JSON.stringify({ expectedAnswers: question.expectedAnswers, canonicalAnswer: question.canonicalAnswer }),
    input.submittedAnswer,
    assessment.isCorrect ? 1 : 0,
    input.hintLevelUsed,
    question.hints.length,
    input.responseTimeMs,
    assessment.failureType,
    now
  );

  saveLearnerWordState(db, updateStateAfterAttempt(word.state, outcome));

  const actualCount = attemptIndex + 1;
  const completed = actualCount >= plan.length;
  if (completed) {
    completeSession(db, session.id);
  } else {
    db.prepare("UPDATE practice_sessions SET actual_question_count = ?, updated_at = ? WHERE id = ?").run(
      actualCount,
      now,
      session.id
    );
  }

  return { completed };
}

export function getSessionSummary(sessionId: string): SessionSummary {
  const db = getDb();
  const session = getSessionRow(db, sessionId);
  return JSON.parse(session.summary_json) as SessionSummary;
}

export function getParentDashboard(): ParentDashboard {
  const db = getDb();
  const words = getParentWords();
  const totalWords = words.length;
  const completeWords = words.filter((word) => word.isComplete).length;
  const redOrangeWords = words.filter((word) => word.masteryColour === "red" || word.masteryColour === "orange").slice(0, 12);
  const closeToGreen = words.filter((word) => word.masteryColour === "light_green").slice(0, 8);
  const dueWords = words
    .filter((word) => {
      const row = db
        .prepare("SELECT next_review_at FROM learner_word_state WHERE learner_id = ? AND word_id = ?")
        .get(defaultLearnerId(), word.id) as { next_review_at: string | null } | undefined;
      return row?.next_review_at ? new Date(row.next_review_at).getTime() <= Date.now() : word.masteryColour !== "green";
    })
    .slice(0, 10);

  const latest = db
    .prepare(
      `SELECT started_at, actual_question_count, summary_json
       FROM practice_sessions
       WHERE learner_id = ? AND status = 'completed'
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get(defaultLearnerId()) as unknown as
    | { started_at: string; actual_question_count: number; summary_json: string }
    | undefined;

  const spellingRows = db
    .prepare(
      `SELECT w.word, COUNT(*) AS mistakes, sn.note
       FROM practice_attempts a
       JOIN words w ON w.id = a.word_id
       LEFT JOIN spelling_notes sn ON sn.word_id = w.id
       WHERE a.learner_id = ? AND a.failure_type = 'spelling_error'
       GROUP BY w.id, w.word, sn.note
       ORDER BY mistakes DESC, w.word ASC
       LIMIT 10`
    )
    .all(defaultLearnerId()) as unknown as Array<{ word: string; mistakes: number; note: string | null }>;

  return {
    totalWords,
    completeWords,
    latestSession: latest
      ? {
          startedAt: latest.started_at,
          actualQuestionCount: latest.actual_question_count,
          summary: JSON.parse(latest.summary_json) as SessionSummary
        }
      : null,
    redOrangeWords,
    spellingMistakes: spellingRows,
    dueWords,
    closeToGreen
  };
}

export function getParentWords(): ParentWordListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.difficulty_level, d.definition, e.sentence AS example, s.mastery_colour
       FROM words w
       LEFT JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       LEFT JOIN word_examples e ON e.word_id = w.id AND e.status = 'approved'
       LEFT JOIN learner_word_state s ON s.word_id = w.id AND s.learner_id = ?
       WHERE w.status = 'active'
       ORDER BY w.word ASC`
    )
    .all(defaultLearnerId()) as unknown as Array<{
    id: string;
    word: string;
    difficulty_level: number;
    definition: string | null;
    example: string | null;
    mastery_colour: LearnerWordState["masteryColour"] | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    word: row.word,
    definition: row.definition,
    example: row.example,
    masteryColour: row.mastery_colour,
    difficultyLevel: row.difficulty_level,
    isComplete: Boolean(row.definition && row.example)
  }));
}

export function createOrUpdateParentWord(input: WordFormInput): string {
  const db = getDb();
  const now = new Date().toISOString();
  const normalized = normalizeWord(input.word);
  if (!normalized) throw new Error("Word is required.");
  const wordId = deterministicWordId(normalized);

  db.prepare(
    `INSERT INTO words (id, word, normalized_word, difficulty_level, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'parent', 'active', ?, ?)
     ON CONFLICT(normalized_word) DO UPDATE SET
       word = excluded.word,
       difficulty_level = excluded.difficulty_level,
       status = 'active',
       updated_at = excluded.updated_at`
  ).run(wordId, input.word.trim(), normalized, clampDifficulty(input.difficultyLevel ?? 2), now, now);

  replaceOptionalWordRows(db, wordId, input, now);
  ensureLearnerStateForWord(db, wordId, now);
  return wordId;
}

export function importWordShells(text: string): number {
  const lines = text
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
  const unique = [...new Set(lines.map(normalizeWord))];
  for (const word of unique) {
    createOrUpdateParentWord({ word, difficultyLevel: 2 });
  }
  return unique.length;
}

function getPracticeWords(): PracticeWord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.normalized_word, w.difficulty_level, d.definition, e.sentence AS example
       FROM words w
       JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       JOIN word_examples e ON e.word_id = w.id AND e.status = 'approved'
       WHERE w.status = 'active'
       ORDER BY w.word ASC`
    )
    .all() as unknown as WordRow[];

  return rows.map((row) => {
    const state = getStateForWord(db, row.id);
    return {
      id: row.id,
      word: row.word,
      normalizedWord: row.normalized_word,
      difficultyLevel: row.difficulty_level,
      definition: row.definition ?? "",
      example: row.example ?? "",
      synonyms: getTextList(db, "word_synonyms", "synonym", row.id),
      antonyms: getTextList(db, "word_antonyms", "antonym", row.id),
      confusables: getTextList(db, "word_confusables", "confusable_text", row.id),
      spellingNote: getSpellingNote(db, row.id),
      state
    };
  });
}

function replaceOptionalWordRows(db: DatabaseSync, wordId: string, input: WordFormInput, now: string): void {
  if (input.definition !== undefined) {
    db.prepare("DELETE FROM word_definitions WHERE word_id = ?").run(wordId);
    if (input.definition.trim()) {
      db.prepare(
        `INSERT INTO word_definitions
          (id, word_id, definition, part_of_speech, is_primary, created_at, updated_at)
         VALUES (?, ?, ?, NULL, 1, ?, ?)`
      ).run(`definition_${wordId}`, wordId, input.definition.trim(), now, now);
    }
  }

  if (input.example !== undefined) {
    db.prepare("DELETE FROM word_examples WHERE word_id = ?").run(wordId);
    if (input.example.trim()) {
      db.prepare(
        `INSERT INTO word_examples
          (id, word_id, sentence, source, status, created_at, updated_at)
         VALUES (?, ?, ?, 'parent', 'approved', ?, ?)`
      ).run(`example_${wordId}`, wordId, input.example.trim(), now, now);
    }
  }

  replaceSingleListValue(db, "word_synonyms", "synonym", wordId, input.synonym, now);
  replaceSingleListValue(db, "word_antonyms", "antonym", wordId, input.antonym, now);

  if (input.confusable !== undefined) {
    db.prepare("DELETE FROM word_confusables WHERE word_id = ?").run(wordId);
    if (input.confusable.trim()) {
      db.prepare(
        `INSERT INTO word_confusables
          (id, word_id, confusable_text, explanation, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)`
      ).run(`confusable_${wordId}_0`, wordId, input.confusable.trim(), now, now);
    }
  }

  if (input.spellingNote !== undefined) {
    db.prepare("DELETE FROM spelling_notes WHERE word_id = ?").run(wordId);
    if (input.spellingNote.trim()) {
      db.prepare(
        `INSERT INTO spelling_notes
          (id, word_id, note, tricky_part, pattern, created_at, updated_at)
         VALUES (?, ?, ?, NULL, NULL, ?, ?)`
      ).run(`spelling_${wordId}`, wordId, input.spellingNote.trim(), now, now);
    }
  }
}

function replaceSingleListValue(
  db: DatabaseSync,
  table: "word_synonyms" | "word_antonyms",
  column: "synonym" | "antonym",
  wordId: string,
  value: string | undefined,
  now: string
): void {
  if (value === undefined) return;
  db.prepare(`DELETE FROM ${table} WHERE word_id = ?`).run(wordId);
  if (!value.trim()) return;
  db.prepare(`INSERT INTO ${table} (id, word_id, ${column}, created_at) VALUES (?, ?, ?, ?)`).run(
    `${column}_${wordId}_0`,
    wordId,
    value.trim(),
    now
  );
}

function completeSession(db: DatabaseSync, sessionId: string): void {
  const now = new Date().toISOString();
  const summary = buildSessionSummary(db, sessionId, now);
  db.prepare(
    `UPDATE practice_sessions
     SET status = 'completed', actual_question_count = (
       SELECT COUNT(*) FROM practice_attempts WHERE session_id = ?
     ), ended_at = ?, summary_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(sessionId, now, JSON.stringify(summary), now, sessionId);
}

function buildSessionSummary(db: DatabaseSync, sessionId: string, completedAt: string): SessionSummary {
  const session = getSessionRow(db, sessionId);
  const plan = readSessionPlan(session);
  const rows = db
    .prepare(
      `SELECT w.word, a.is_correct, a.failure_type
       FROM practice_attempts a
       JOIN words w ON w.id = a.word_id
       WHERE a.session_id = ?
       ORDER BY a.created_at ASC`
    )
    .all(sessionId) as unknown as Array<{ word: string; is_correct: number; failure_type: FailureType }>;

  return {
    plan,
    wordsImproved: unique(rows.filter((row) => row.is_correct === 1).map((row) => row.word)).slice(0, 8),
    spellingTraps: unique(rows.filter((row) => row.failure_type === "spelling_error").map((row) => row.word)).slice(0, 8),
    revisitTomorrow: unique(rows.filter((row) => row.is_correct === 0).map((row) => row.word)).slice(0, 8),
    completedAt
  };
}

function getSessionRow(db: DatabaseSync, sessionId: string): SessionRow {
  const session = db.prepare("SELECT * FROM practice_sessions WHERE id = ?").get(sessionId) as unknown as
    | SessionRow
    | undefined;
  if (!session) throw new Error(`Unknown session ${sessionId}`);
  return session;
}

function readSessionPlan(session: SessionRow): SessionPlanItem[] {
  const summary = JSON.parse(session.summary_json) as SessionSummary;
  return summary.plan ?? [];
}

function getSessionAttemptCount(db: DatabaseSync, sessionId: string): number {
  return (db.prepare("SELECT COUNT(*) AS count FROM practice_attempts WHERE session_id = ?").get(sessionId) as { count: number })
    .count;
}

function getStateForWord(db: DatabaseSync, wordId: string): LearnerWordState {
  ensureLearnerStateForWord(db, wordId, new Date().toISOString());
  const row = db
    .prepare("SELECT * FROM learner_word_state WHERE learner_id = ? AND word_id = ?")
    .get(defaultLearnerId(), wordId) as unknown as StateRow;
  return mapState(row);
}

function saveLearnerWordState(db: DatabaseSync, state: LearnerWordState): void {
  db.prepare(
    `UPDATE learner_word_state SET
       meaning_mastery = ?,
       usage_mastery = ?,
       spelling_mastery = ?,
       stability_days = ?,
       mastery_colour = ?,
       last_seen_at = ?,
       last_correct_at = ?,
       last_wrong_at = ?,
       next_review_at = ?,
       attempt_count = ?,
       correct_count = ?,
       wrong_count = ?,
       last_hint_level_used = ?,
       average_hint_level_used = ?,
       average_response_time_ms = ?,
       failure_types_json = ?,
       confused_with_word_ids_json = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
    state.meaningMastery,
    state.usageMastery,
    state.spellingMastery,
    state.stabilityDays,
    state.masteryColour,
    state.lastSeenAt,
    state.lastCorrectAt,
    state.lastWrongAt,
    state.nextReviewAt,
    state.attemptCount,
    state.correctCount,
    state.wrongCount,
    state.lastHintLevelUsed,
    state.averageHintLevelUsed,
    state.averageResponseTimeMs,
    JSON.stringify(state.failureTypes),
    JSON.stringify(state.confusedWithWordIds),
    new Date().toISOString(),
    state.id
  );
}

function ensureLearnerStateForWord(db: DatabaseSync, wordId: string, now: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO learner_word_state
      (id, learner_id, word_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(`state_${defaultLearnerId()}_${wordId}`, defaultLearnerId(), wordId, now, now);
}

function mapState(row: StateRow): LearnerWordState {
  return {
    id: row.id,
    learnerId: row.learner_id,
    wordId: row.word_id,
    meaningMastery: row.meaning_mastery,
    usageMastery: row.usage_mastery,
    spellingMastery: row.spelling_mastery,
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
    failureTypes: JSON.parse(row.failure_types_json) as FailureType[],
    confusedWithWordIds: JSON.parse(row.confused_with_word_ids_json) as string[]
  };
}

function getTextList(db: DatabaseSync, table: string, column: string, wordId: string): string[] {
  const rows = db.prepare(`SELECT ${column} AS value FROM ${table} WHERE word_id = ?`).all(wordId) as unknown as Array<{
    value: string | null;
  }>;
  return rows.map((row) => row.value).filter((value): value is string => Boolean(value));
}

function getSpellingNote(db: DatabaseSync, wordId: string): string | null {
  const row = db.prepare("SELECT note FROM spelling_notes WHERE word_id = ? LIMIT 1").get(wordId) as
    | { note: string }
    | undefined;
  return row?.note ?? null;
}

function weakestDimensionLabel(state: LearnerWordState): string {
  const values = [
    ["Meaning", state.meaningMastery],
    ["Usage", state.usageMastery],
    ["Spelling", state.spellingMastery]
  ] as const;
  return values.reduce((weakest, next) => (next[1] < weakest[1] ? next : weakest))[0];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampDifficulty(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}
