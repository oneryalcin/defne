import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  assessSpellingAnswer,
  buildSpellingQuestion,
  type SpellingPracticeItem,
  type SpellingQuestion
} from "../learning/spelling";
import {
  spellingFocusStatuses,
  spellingProgressStatus,
  type SpellingFocus,
} from "../learning/spellingProgress";
import { applyPracticeEventToSelectionState, updateStateAfterAttempt } from "../learning/mastery";
import {
  selectRoundWords,
  selectionBucketForWord,
  type RoundSelectionBucketTargets
} from "../learning/roundSelection";
import type { FailureType, LearnerWordState, PracticeAttemptOutcome, PracticeWord } from "../types";
import { getDb } from "./index";
import { defaultLearnerId, normalizeWord } from "./seed";
import { normaliseParentSpellingWord } from "../normalization";

export { normaliseParentSpellingWord } from "../normalization";

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

interface SpellingStateRow {
  id: string;
  learner_id: string;
  item_id: string;
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

export interface SpellingRoundMixPreference extends RoundSelectionBucketTargets {}

export const DEFAULT_SPELLING_ROUND_MIX: SpellingRoundMixPreference = {
  new: 3,
  recovery: 3,
  review: 2,
  stable: 0
};

export interface SpellingPreview {
  targetItemCount: number;
  source: "new_round" | "current_round";
  focus: SpellingFocus | null;
  items: Array<{
    id: string;
    target: string;
    promptCount: number;
    attemptCount: number;
    correctCount: number;
    wrongCount: number;
  }>;
}

export interface SpellingFocusOption {
  status: SpellingFocus;
  eligibleCount: number;
}

export function getSpellingRoundMixPreference(learnerId = defaultLearnerId()): SpellingRoundMixPreference {
  return getSpellingRoundMixPreferenceFromDb(getDb(), learnerId);
}

export function setSpellingRoundMixPreference(
  preference: Partial<SpellingRoundMixPreference>,
  learnerId = defaultLearnerId()
): void {
  const db = getDb();
  const previous = getSpellingRoundMixPreferenceFromDb(db, learnerId);
  const normalized = normalizeSpellingRoundMix(preference);
  const changed = !spellingRoundMixEquals(previous, normalized);

  db.prepare(
    `UPDATE learner_profiles
     SET spelling_round_new_count = ?,
         spelling_round_recovery_count = ?,
         spelling_round_review_count = ?,
         spelling_round_stable_count = ?,
         updated_at = ?
     WHERE learner_id = ?`
  ).run(
    normalized.new,
    normalized.recovery,
    normalized.review,
    normalized.stable,
    new Date().toISOString(),
    learnerId
  );
  if (changed) abandonActiveSpellingSessions(db, learnerId);
}

export interface ParentSpellingItemInput {
  itemId?: string;
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
  correctCount: number;
  wrongCount: number;
  commonMisspelling: string | null;
  priorityMode: "normal" | "next_round_once";
}

export interface ParentSpellingLibraryItem {
  id: string;
  target: string;
  usageLabel: string;
  teachingNote: string;
  promptCount: number;
  assigned: boolean;
  priorityMode: "normal" | "next_round_once";
}

export interface ChildSpellingListItem {
  id: string;
  target: string;
  usageLabel: string;
  teachingNote: string;
  studyGroup: string;
  commonMisspelling: string | null;
  promptCount: number;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  lastAttemptAt: string | null;
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

export function getChildSpellingWords(learnerId = defaultLearnerId()): ChildSpellingListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.id,
              i.target_word,
              i.usage_label,
              i.teaching_note,
              i.study_group,
              i.common_misspelling,
              prompts.prompt_count,
              COALESCE(stats.attempt_count, 0) AS attempt_count,
              COALESCE(stats.correct_count, 0) AS correct_count,
              COALESCE(stats.wrong_count, 0) AS wrong_count,
              stats.last_attempt_at
       FROM spelling_items i
       JOIN learner_spelling_items lsi ON lsi.item_id = i.id AND lsi.learner_id = ? AND lsi.status = 'active'
       LEFT JOIN (
         SELECT item_id, COUNT(*) AS prompt_count
         FROM spelling_prompts
         WHERE status = 'approved'
         GROUP BY item_id
       ) prompts ON prompts.item_id = i.id
       LEFT JOIN (
         SELECT item_id,
                COUNT(*) AS attempt_count,
                SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
                SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
                MAX(created_at) AS last_attempt_at
         FROM spelling_attempts
         WHERE learner_id = ?
         GROUP BY item_id
       ) stats ON stats.item_id = i.id
       WHERE i.status = 'active'
       ORDER BY COALESCE(stats.wrong_count, 0) DESC,
                COALESCE(stats.attempt_count, 0) ASC,
                i.study_group ASC,
                i.target_word ASC`
    )
    .all(learnerId, learnerId) as unknown as Array<{
    id: string;
    target_word: string;
    usage_label: string;
    teaching_note: string;
    study_group: string;
    common_misspelling: string | null;
    prompt_count: number | null;
    attempt_count: number;
    correct_count: number | null;
    wrong_count: number | null;
    last_attempt_at: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    target: row.target_word,
    usageLabel: row.usage_label,
    teachingNote: row.teaching_note,
    studyGroup: row.study_group,
    commonMisspelling: row.common_misspelling,
    promptCount: row.prompt_count ?? 0,
    attemptCount: row.attempt_count,
    correctCount: row.correct_count ?? 0,
    wrongCount: row.wrong_count ?? 0,
    lastAttemptAt: row.last_attempt_at
  }));
}

export function getSpellingPreview(
  targetItemCount = 8,
  learnerId = defaultLearnerId(),
  focus: SpellingFocus | null = null
): SpellingPreview {
  const db = getDb();
  const existing = getLatestInProgressSpellingSession(db, learnerId);
  const items = existing
    ? getSpellingItemsByIds(db, readJsonStringArray(existing.item_ids_json))
    : selectSpellingItems(db, targetItemCount, learnerId, focus);
  const stats = getSpellingStatsByItem(db, learnerId);

  return {
    targetItemCount: items.length,
    source: existing ? "current_round" : "new_round",
    focus: existing ? null : focus,
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

export function getSpellingFocusOptions(learnerId = defaultLearnerId()): SpellingFocusOption[] {
  const db = getDb();
  const words = loadSpellingPracticeWordsForSelection(db, new Date().toISOString(), learnerId);
  return spellingFocusStatuses.map((status) => ({
    status,
    eligibleCount: words.filter((word) => spellingProgressStatus(word.state) === status).length
  }));
}

export function getParentSpellingItems(learnerId = defaultLearnerId()): ParentSpellingListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT i.id,
              i.target_word,
              i.usage_label,
              i.teaching_note,
              i.study_group,
              i.source,
              i.common_misspelling,
              lsi.priority_mode,
              COUNT(DISTINCT p.id) AS prompt_count,
              COUNT(DISTINCT a.id) AS attempt_count,
              COUNT(DISTINCT CASE WHEN a.is_correct = 1 THEN a.id END) AS correct_count,
              COUNT(DISTINCT CASE WHEN a.is_correct = 0 THEN a.id END) AS wrong_count
       FROM spelling_items i
       JOIN learner_spelling_items lsi ON lsi.item_id = i.id AND lsi.learner_id = ? AND lsi.status = 'active'
       LEFT JOIN spelling_prompts p ON p.item_id = i.id AND p.status = 'approved'
       LEFT JOIN spelling_attempts a ON a.item_id = i.id AND a.learner_id = ?
       WHERE i.status = 'active'
       GROUP BY i.id
       ORDER BY i.study_group ASC, i.target_word ASC`
    )
    .all(learnerId, learnerId) as unknown as Array<{
    id: string;
    target_word: string;
    usage_label: string;
    teaching_note: string;
    study_group: string;
    source: string;
    common_misspelling: string | null;
    priority_mode: "normal" | "next_round_once";
    prompt_count: number;
    attempt_count: number;
    correct_count: number | null;
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
      correctCount: row.correct_count ?? 0,
      wrongCount: row.wrong_count ?? 0,
      commonMisspelling: row.common_misspelling,
      priorityMode: row.priority_mode
    }));
}

export function listAvailableSpellingItemsForLearner(learnerId: string): ParentSpellingLibraryItem[] {
  const rows = getDb()
    .prepare(
      `SELECT i.id,
              i.target_word,
              i.usage_label,
              i.teaching_note,
              COUNT(DISTINCT p.id) AS prompt_count,
              COALESCE(lsi.priority_mode, 'normal') AS priority_mode,
              CASE WHEN lsi.status = 'active' THEN 1 ELSE 0 END AS assigned
       FROM spelling_items i
       LEFT JOIN spelling_prompts p ON p.item_id = i.id AND p.status = 'approved'
       LEFT JOIN learner_spelling_items lsi ON lsi.item_id = i.id AND lsi.learner_id = ?
       WHERE i.status = 'active'
       GROUP BY i.id
       ORDER BY assigned ASC, i.study_group ASC, i.target_word ASC`
    )
    .all(learnerId) as Array<{
    id: string;
    target_word: string;
    usage_label: string;
    teaching_note: string;
    prompt_count: number;
    priority_mode: "normal" | "next_round_once";
    assigned: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    target: row.target_word,
    usageLabel: row.usage_label,
    teachingNote: row.teaching_note,
    promptCount: row.prompt_count,
    assigned: row.assigned === 1,
    priorityMode: row.priority_mode
  }));
}

export function assignSpellingItemToLearner(learnerId: string, itemId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO learner_spelling_items
         (learner_id, item_id, status, assigned_at, priority_mode, priority_requested_at, priority_consumed_at, created_at, updated_at)
       VALUES (?, ?, 'active', ?, 'normal', NULL, NULL, ?, ?)
       ON CONFLICT(learner_id, item_id) DO UPDATE SET
         status = 'active',
         updated_at = excluded.updated_at`
    )
    .run(learnerId, itemId, now, now, now);
}

export function unassignSpellingItemFromLearner(learnerId: string, itemId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE learner_spelling_items
       SET status = 'paused',
           priority_mode = 'normal',
           priority_requested_at = NULL,
           updated_at = ?
       WHERE learner_id = ? AND item_id = ?`
    )
    .run(now, learnerId, itemId);
}

export function requestSpellingItemNextRound(learnerId: string, itemId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE learner_spelling_items
       SET priority_mode = 'next_round_once',
           priority_requested_at = ?,
           priority_consumed_at = NULL,
           updated_at = ?
       WHERE learner_id = ? AND item_id = ? AND status = 'active'`
    )
    .run(now, now, learnerId, itemId);
}

export function clearSpellingItemPriority(learnerId: string, itemId: string): void {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `UPDATE learner_spelling_items
       SET priority_mode = 'normal',
           priority_requested_at = NULL,
           updated_at = ?
       WHERE learner_id = ? AND item_id = ?`
    )
    .run(now, learnerId, itemId);
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

export function createOrUpdateParentSpellingItem(input: ParentSpellingItemInput, learnerId = defaultLearnerId()): string {
  const db = getDb();
  const now = new Date().toISOString();
  const canonicalTarget = normaliseParentSpellingWord(input.target);
  const normalizedTarget = normalizeWord(canonicalTarget);
  if (!normalizedTarget) throw new Error("Target word is required.");

  const canonicalPair = normaliseParentSpellingWord(input.pairedTarget ?? "");
  const normalizedPair = normalizeWord(canonicalPair);
  const studyGroup = spellingStudyGroup(normalizedTarget, normalizedPair);
  const resolvedItemId = input.itemId?.trim();
  const itemId = deterministicSpellingItemId(normalizedTarget);
  const pairItemId = normalizedPair ? deterministicSpellingItemId(normalizedPair) : null;
  const sentences = uniqueTexts(input.sentences);
  if (sentences.length === 0) throw new Error("At least one sentence is required.");

  if (resolvedItemId) {
    const existing =
      db
        .prepare("SELECT id, normalized_target, study_group FROM spelling_items WHERE id = ?")
        .get(resolvedItemId) as { id: string; normalized_target: string; study_group: string } | undefined;
    if (!existing) throw new Error("Spelling item not found.");
    if (existing.normalized_target !== normalizedTarget) {
      const duplicate = db
        .prepare("SELECT id FROM spelling_items WHERE normalized_target = ? AND id <> ?")
        .get(normalizedTarget, resolvedItemId) as { id: string } | undefined;
      if (duplicate) {
        throw new Error(`\"${canonicalTarget}\" is already in the spelling list.`);
      }
    }

    const existingRelatedTargets = studyGroupTokens(existing.study_group).filter(
      (target) => target !== existing.normalized_target
    );
    const nextRelatedTargets = normalizedPair
      ? studyGroupTokens(studyGroup).filter((target) => target !== normalizedTarget)
      : [];
    const staleRelatedTargets = existingRelatedTargets.filter((target) => !nextRelatedTargets.includes(target));

    db.prepare(
      `UPDATE spelling_items
       SET target_word = ?,
           normalized_target = ?,
           study_group = ?,
           source = 'parent',
           usage_label = ?,
           teaching_note = ?,
           difficulty_level = ?,
           updated_at = ?
       WHERE id = ?`
    ).run(
      canonicalTarget,
      normalizedTarget,
      studyGroup,
      input.usageLabel ?? "",
      input.teachingNote,
      clampDifficulty(input.difficultyLevel ?? 2),
      now,
      existing.id
    );

    for (const staleTarget of staleRelatedTargets) {
      const stalePairId = deterministicSpellingItemId(staleTarget);
      db.prepare(
        `DELETE FROM spelling_items
         WHERE id = ?
           AND study_group = ?
           AND source = 'parent'
           AND status = 'active'
           AND TRIM(usage_label) = ''
           AND TRIM(teaching_note) = ''
           AND NOT EXISTS (SELECT 1 FROM spelling_prompts p WHERE p.item_id = spelling_items.id)`
      ).run(stalePairId, existing.study_group);
    }
  } else {
    upsertParentSpellingShell(db, {
      itemId,
      target: canonicalTarget,
      normalizedTarget,
      studyGroup,
      usageLabel: input.usageLabel ?? "",
      teachingNote: input.teachingNote,
      difficultyLevel: input.difficultyLevel,
      ownsContent: true,
      now
    });
  }

  if (normalizedPair) {
    upsertParentSpellingShell(db, {
      itemId: pairItemId ?? deterministicSpellingItemId(normalizedPair),
      target: canonicalPair || normalizedPair,
      normalizedTarget: normalizedPair,
      studyGroup,
      usageLabel: "",
      teachingNote: "",
      difficultyLevel: input.difficultyLevel,
      ownsContent: false,
      now
    });
  }

  replaceParentSpellingPrompts(db, resolvedItemId ?? itemId, sentences, now);
  const savedItemId = resolvedItemId ?? itemId;
  assignSpellingItemToLearner(learnerId, savedItemId);
  if (pairItemId) assignSpellingItemToLearner(learnerId, pairItemId);
  return savedItemId;
}

export function startSpellingMission(
  targetItemCount = 8,
  learnerId = defaultLearnerId(),
  focus: SpellingFocus | null = null
): string {
  const db = getDb();
  const existing = getLatestInProgressSpellingSession(db, learnerId);
  if (existing) return existing.id;

  const items = selectSpellingItems(db, targetItemCount, learnerId, focus);
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
    learnerId,
    itemIds.length,
    JSON.stringify(itemIds),
    now,
    JSON.stringify(summary),
    now,
    now
  );

  consumeSpellingNextRoundPriorities(db, learnerId, itemIds, now);

  return sessionId;
}

export function replaceSpellingMission(
  targetItemCount = 8,
  learnerId = defaultLearnerId(),
  focus: SpellingFocus | null = null
): string {
  const db = getDb();
  abandonActiveSpellingSessions(db, learnerId);
  return startSpellingMission(targetItemCount, learnerId, focus);
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
  const itemIds = readJsonStringArray(session.item_ids_json);
  itemIds.forEach((itemId, index) => {
    const state = getSpellingStateForItem(db, itemId, now, session.learner_id);
    saveSpellingLearnerState(db, {
      ...state,
      lastExposedAt: now,
      lastPracticedAt: now,
      lastPracticedSessionId: session.id,
      lastPracticedInteractionIndex: index + 1
    });
  });
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
  const priorItemAttemptsInSession = (
    db
      .prepare("SELECT COUNT(*) AS count FROM spelling_attempts WHERE session_id = ? AND item_id = ?")
      .get(session.id, item.id) as { count: number }
  ).count;

  db.prepare(
    `INSERT INTO spelling_attempts
      (id, session_id, learner_id, item_id, prompt_id, prompt_json, expected_answer_json,
       submitted_answer, is_correct, response_time_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    session.id,
    session.learner_id,
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

  const previousState = getSpellingStateForItem(db, item.id, now, session.learner_id);
  const outcome: PracticeAttemptOutcome = {
    questionType: "spelling_choice",
    isCorrect: assessment.isCorrect,
    hintLevelUsed: 0,
    maxHintLevelAvailable: 0,
    responseTimeMs: Number.isFinite(input.responseTimeMs) ? input.responseTimeMs : 0,
    failureType: assessment.isCorrect ? "none" : "spelling_error",
    answeredAt: now
  };
  saveSpellingLearnerState(
    db,
    applyPracticeEventToSelectionState(updateStateAfterAttempt(previousState, outcome), previousState, {
      answeredAt: now,
      isCorrect: assessment.isCorrect,
      hintLevelUsed: 0,
      revealAndMoveOn: false,
      firstAttemptCorrect: assessment.isCorrect && priorItemAttemptsInSession === 0,
      sessionId: session.id,
      interactionIndex: getSpellingSessionAttemptCount(db, session.id)
    })
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

function getLatestInProgressSpellingSession(db: DatabaseSync, learnerId: string): SpellingSessionRow | null {
  const row = db
    .prepare(
      `SELECT *
       FROM spelling_sessions
       WHERE learner_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC, created_at DESC
       LIMIT 1`
    )
    .get(learnerId) as SpellingSessionRow | undefined;
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

function selectSpellingItems(
  db: DatabaseSync,
  limit: number,
  learnerId: string,
  focus: SpellingFocus | null = null
): SpellingPracticeItem[] {
  const nowIso = new Date().toISOString();
  const words = loadSpellingPracticeWordsForSelection(db, nowIso, learnerId);
  const focusedWords = focus ? words.filter((word) => spellingProgressStatus(word.state) === focus) : words;
  const priorityIds = getSpellingNextRoundPriorityItemIds(db, learnerId)
    .filter((itemId) => focusedWords.some((word) => word.id === itemId))
    .slice(0, Math.min(2, Math.max(0, limit)));
  const prioritySet = new Set(priorityIds);
  if (limit > 12) {
    const itemIds = [
      ...priorityIds,
      ...focusedWords.map((word) => word.id).filter((itemId) => !prioritySet.has(itemId)).slice(0, limit - priorityIds.length)
    ];
    return getSpellingItemsByIds(db, itemIds);
  }

  const priorityWords = priorityIds.map((itemId) => focusedWords.find((word) => word.id === itemId)).filter((word): word is PracticeWord => Boolean(word));
  if (focus) {
    const selection = selectRoundWords(focusedWords.filter((word) => !prioritySet.has(word.id)), nowIso, limit - priorityIds.length, {
      revealAndMoveOnWordIds: [],
      eventuallyCorrectNotFirstAttemptWordIds: []
    }, { allowPartialCount: true, reserveIntroduction: false });
    return getSpellingItemsByIds(db, [...priorityIds, ...selection.wordIds].slice(0, limit));
  }
  const bucketTargets =
    limit >= 8
      ? getAdjustedSpellingBucketTargetsForFill(
          getSpellingRoundMixPreferenceFromDb(db, learnerId),
          priorityWords,
          nowIso
        )
      : undefined;
  const fillCount = limit - priorityIds.length;
  const selection = selectRoundWords(focusedWords.filter((word) => !prioritySet.has(word.id)), nowIso, fillCount, {
    revealAndMoveOnWordIds: [],
    eventuallyCorrectNotFirstAttemptWordIds: []
  }, { bucketTargets, allowPartialCount: true, reserveIntroduction: limit >= 8 });
  const fillIds = selection.wordIds.filter((itemId) => !prioritySet.has(itemId)).slice(0, fillCount);
  return getSpellingItemsByIds(db, [...priorityIds, ...fillIds]);
}

function getAdjustedSpellingBucketTargetsForFill(
  mix: SpellingRoundMixPreference,
  priorityWords: PracticeWord[],
  nowIso: string
): SpellingRoundMixPreference {
  const adjusted = { ...mix };
  for (const word of priorityWords) {
    const bucket = selectionBucketForWord(word, nowIso);
    adjusted[bucket] = Math.max(0, adjusted[bucket] - 1);
  }
  return adjusted;
}

function getSpellingRoundMixPreferenceFromDb(
  db: DatabaseSync,
  learnerId = defaultLearnerId()
): SpellingRoundMixPreference {
  const row = db
    .prepare(
      `SELECT spelling_round_new_count,
              spelling_round_recovery_count,
              spelling_round_review_count,
              spelling_round_stable_count
       FROM learner_profiles
       WHERE learner_id = ?`
    )
    .get(learnerId) as
    | {
        spelling_round_new_count: number;
        spelling_round_recovery_count: number;
        spelling_round_review_count: number;
        spelling_round_stable_count: number;
      }
    | undefined;
  return normalizeSpellingRoundMix(
    row
      ? {
          new: row.spelling_round_new_count,
          recovery: row.spelling_round_recovery_count,
          review: row.spelling_round_review_count,
          stable: row.spelling_round_stable_count
        }
      : DEFAULT_SPELLING_ROUND_MIX
  );
}

function normalizeSpellingRoundMix(preference: Partial<SpellingRoundMixPreference>): SpellingRoundMixPreference {
  const count = (value: number | undefined, fallback: number) => {
    const rounded = Math.round(value ?? fallback);
    return Number.isFinite(rounded) ? Math.max(0, Math.min(8, rounded)) : fallback;
  };
  const values = {
    new: count(preference.new, DEFAULT_SPELLING_ROUND_MIX.new),
    recovery: count(preference.recovery, DEFAULT_SPELLING_ROUND_MIX.recovery),
    review: count(preference.review, DEFAULT_SPELLING_ROUND_MIX.review),
    stable: count(preference.stable, DEFAULT_SPELLING_ROUND_MIX.stable)
  };
  const total = values.new + values.recovery + values.review + values.stable;
  if (total <= 8) return values;

  let overflow = total - 8;
  for (const bucket of ["stable", "review", "recovery", "new"] as const) {
    const reduction = Math.min(values[bucket], overflow);
    values[bucket] -= reduction;
    overflow -= reduction;
    if (overflow === 0) break;
  }
  return values;
}

function spellingRoundMixEquals(a: SpellingRoundMixPreference, b: SpellingRoundMixPreference): boolean {
  return a.new === b.new && a.recovery === b.recovery && a.review === b.review && a.stable === b.stable;
}

function abandonActiveSpellingSessions(db: DatabaseSync, learnerId: string): void {
  const sessions = db
    .prepare(
      `SELECT id
       FROM spelling_sessions
       WHERE learner_id = ? AND status = 'in_progress'`
    )
    .all(learnerId) as Array<{ id: string }>;
  if (sessions.length === 0) return;

  const now = new Date().toISOString();
  for (const session of sessions) {
    db.prepare(
      `UPDATE spelling_sessions
       SET status = 'abandoned', ended_at = ?, updated_at = ?
       WHERE id = ? AND status = 'in_progress'`
    ).run(now, now, session.id);
  }
}

function getSpellingNextRoundPriorityItemIds(db: DatabaseSync, learnerId: string): string[] {
  const rows = db
    .prepare(
      `SELECT lsi.item_id
       FROM learner_spelling_items lsi
       JOIN spelling_items i ON i.id = lsi.item_id AND i.status = 'active'
       WHERE lsi.learner_id = ?
         AND lsi.status = 'active'
         AND lsi.priority_mode = 'next_round_once'
         AND EXISTS (SELECT 1 FROM spelling_prompts p WHERE p.item_id = i.id AND p.status = 'approved')
       ORDER BY lsi.priority_requested_at ASC, i.target_word ASC`
    )
    .all(learnerId) as Array<{ item_id: string }>;
  return rows.map((row) => row.item_id);
}

function consumeSpellingNextRoundPriorities(db: DatabaseSync, learnerId: string, itemIds: string[], now: string): void {
  if (itemIds.length === 0) return;
  const placeholders = itemIds.map(() => "?").join(", ");
  db.prepare(
    `UPDATE learner_spelling_items
     SET priority_mode = 'normal',
         priority_consumed_at = ?,
         updated_at = ?
     WHERE learner_id = ?
       AND priority_mode = 'next_round_once'
       AND item_id IN (${placeholders})`
  ).run(now, now, learnerId, ...itemIds);
}

function loadSpellingPracticeWordsForSelection(db: DatabaseSync, now: string, learnerId: string): PracticeWord[] {
  ensureSpellingLearnerStates(db, now, learnerId);
  const rows = db
    .prepare(
      `SELECT i.id AS item_id_for_selection,
              i.target_word,
              i.normalized_target,
              i.difficulty_level,
              i.teaching_note,
              i.study_group,
              s.*
       FROM spelling_items i
       JOIN learner_spelling_items lsi ON lsi.item_id = i.id AND lsi.learner_id = ? AND lsi.status = 'active'
       JOIN spelling_learner_state s ON s.item_id = i.id AND s.learner_id = ?
       WHERE i.status = 'active'
         AND EXISTS (
           SELECT 1 FROM spelling_prompts p
           WHERE p.item_id = i.id AND p.status = 'approved'
         )`
    )
    .all(learnerId, learnerId) as unknown as Array<{
    item_id_for_selection: string;
    target_word: string;
    normalized_target: string;
    difficulty_level: number;
    teaching_note: string;
    study_group: string;
  } & SpellingStateRow>;

  return rows.map((row) => {
    const itemId = row.item_id_for_selection;
    const prompts = getSpellingPrompts(db, itemId);
    return {
      id: itemId,
      word: row.target_word,
      normalizedWord: row.normalized_target,
      difficultyLevel: row.difficulty_level,
      definition: row.teaching_note,
      example: prompts[0]?.sentence ?? "",
      examples: prompts.map((prompt) => prompt.sentence),
      synonyms: [],
      antonyms: [],
      confusables: getSpellingConfusables(db, row.study_group || itemId, itemId),
      state: mapSpellingState(row)
    };
  });
}

function getSpellingItemsByIds(db: DatabaseSync, itemIds: string[]): SpellingPracticeItem[] {
  if (itemIds.length === 0) return [];
  const placeholders = itemIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT id, target_word, teaching_note, study_group, usage_label, common_misspelling
       FROM spelling_items
       WHERE id IN (${placeholders}) AND status = 'active'`
    )
    .all(...itemIds) as Array<{
      id: string;
      target_word: string;
      teaching_note: string;
      study_group: string;
      usage_label: string;
      common_misspelling: string | null;
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
        commonMisspelling: row.common_misspelling,
        confusables: getSpellingConfusables(db, row.study_group || row.id, row.id),
        prompts: getSpellingPrompts(db, row.id)
      }
    ];
  });
}

function ensureSpellingLearnerStates(db: DatabaseSync, now: string, learnerId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO spelling_learner_state
      (id, learner_id, item_id, created_at, updated_at)
     SELECT 'spelling_state_' || ? || '_' || i.id, ?, i.id, ?, ?
     FROM spelling_items i
     JOIN learner_spelling_items lsi ON lsi.item_id = i.id AND lsi.learner_id = ? AND lsi.status = 'active'
     WHERE i.status = 'active'
       AND EXISTS (
         SELECT 1 FROM spelling_prompts p
         WHERE p.item_id = i.id AND p.status = 'approved'
       )`
  ).run(learnerId, learnerId, now, now, learnerId);
}

function getSpellingStateForItem(db: DatabaseSync, itemId: string, now: string, learnerId: string): LearnerWordState {
  ensureSpellingLearnerStateForItem(db, itemId, now, learnerId);
  const row = db
    .prepare("SELECT * FROM spelling_learner_state WHERE learner_id = ? AND item_id = ?")
    .get(learnerId, itemId) as SpellingStateRow | undefined;
  if (!row) throw new Error(`Spelling learner state missing for ${itemId}`);
  return mapSpellingState(row);
}

function ensureSpellingLearnerStateForItem(db: DatabaseSync, itemId: string, now: string, learnerId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO spelling_learner_state
      (id, learner_id, item_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(`spelling_state_${learnerId}_${itemId}`, learnerId, itemId, now, now);
}

function saveSpellingLearnerState(db: DatabaseSync, state: LearnerWordState): void {
  db.prepare(
    `UPDATE spelling_learner_state SET
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
       near_review = ?,
       eligible_questions_since_last_mistake = ?,
       recovery_debt = ?,
       last_practiced_at = ?,
       last_clean_retrieval_at = ?,
       last_supported_success_at = ?,
       last_revealed_at = ?,
       last_exposed_at = ?,
       last_practiced_session_id = ?,
       last_practiced_interaction_index = ?,
       learner_state_content_version = ?,
       updated_at = ?
     WHERE id = ?`
  ).run(
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
    state.nearReview ? 1 : 0,
    state.eligibleQuestionsSinceLastMistake,
    state.recoveryDebt,
    state.lastPracticedAt,
    state.lastCleanRetrievalAt,
    state.lastSupportedSuccessAt,
    state.lastRevealedAt,
    state.lastExposedAt,
    state.lastPracticedSessionId,
    state.lastPracticedInteractionIndex,
    state.learnerStateContentVersion,
    new Date().toISOString(),
    state.id
  );
}

function mapSpellingState(row: SpellingStateRow): LearnerWordState {
  return {
    id: row.id,
    learnerId: row.learner_id,
    wordId: row.item_id,
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
    confusedWithWordIds: JSON.parse(row.confused_with_word_ids_json) as string[],
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

function getSpellingSessionAttemptCount(db: DatabaseSync, sessionId: string): number {
  return (
    db.prepare("SELECT COUNT(*) AS count FROM spelling_attempts WHERE session_id = ?").get(sessionId) as { count: number }
  ).count;
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

function getSpellingStatsByItem(db: DatabaseSync, learnerId: string): Map<string, { attempts: number; correct: number; wrong: number }> {
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
    .all(learnerId) as Array<{ item_id: string; attempts: number; correct: number; wrong: number }>;
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

function studyGroupTokens(studyGroup: string): string[] {
  return studyGroup
    .split("_")
    .map((token) => token.trim())
    .filter(Boolean);
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
