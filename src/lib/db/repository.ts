import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { assessAnswer, generateQuestion, type PracticeQuestion } from "../learning/questions";
import { applyPracticeEventToSelectionState, masteryColourForState, updateStateAfterAttempt } from "../learning/mastery";
import { priorityBreakdownForState, scoreFromState } from "../learning/scoring";
import {
  deckPriorities,
  nextBucketTarget,
  projectWord,
  rankFor,
  type DayProjection,
} from "../learning/projection";
import {
  selectRoundWords,
  selectionBucketForWord,
  type RoundSelectionBucketTargets,
  type RoundWordSelection
} from "../learning/roundSelection";
import {
  DEFAULT_NEAR_REVIEW_SPACING,
  DEFAULT_ROUND_MAX_RETRY_PASSES,
  canUnlockMeaningStep,
  evaluateRoundStepProgress,
  learnCardSupportMode,
  nextRoundStepQuestion,
  shouldKeepNearReview,
  type LearnCardSupportMode,
  type RoundLearningStep,
  type RoundStep,
  type RoundStepAttempt
} from "../learning/rounds";
import type {
  AttemptRecord,
  FailureType,
  LearnerWordState,
  PracticeAttemptOutcome,
  PracticeWord,
  QuestionType,
  RoundSelectionReason,
  SessionPlanItem,
  SessionSummary
} from "../types";
import { getDb } from "./index";
import { defaultLearnerId, deterministicWordId, normalizeWord } from "./seed";
import { assignVocabularyWordToLearnerInDb } from "./learners";

const UNSTARTED_PREVIEW_STALE_HOURS = 20;

export interface NextRoundMixPreference extends RoundSelectionBucketTargets {}

export const DEFAULT_NEXT_ROUND_MIX: NextRoundMixPreference = {
  new: 3,
  recovery: 4,
  review: 4,
  stable: 1
};

export interface VisualCue {
  src: string;
  alt: string;
  exampleId: string;
}

export interface VisualCuePreferences {
  enabled: boolean;
  learnCards: boolean;
  meaningQuestions: boolean;
  contextQuestions: boolean;
}

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

interface PracticeRoundRow {
  id: string;
  session_id: string;
  learner_id: string;
  status: "in_progress" | "completed" | "abandoned";
  current_step: RoundLearningStep;
  max_retry_passes: number;
  word_ids_json: string;
  card_view_counts_json: string;
  started_at: string;
  ended_at: string | null;
  summary_json: string;
  created_at: string;
  updated_at: string;
}

export interface MissionPreview {
  targetQuestionCount: number;
  words: Array<{
    id: string;
    word: string;
    definition: string;
    masteryColour: LearnerWordState["masteryColour"] | null;
    selectionReason: RoundSelectionReason;
    /** Debug breakdown of why the scheduler picked this word. */
    priorityFactors: Array<{
      name: string;
      value: number;
      weight: number;
      contribution: number;
      note: string;
    }>;
    priorityScore: number;
  }>;
}

export interface SessionView {
  mode: "daily_mission" | "round_mission";
  sessionId: string;
  status: SessionRow["status"];
  questionNumber: number;
  totalQuestions: number;
  question: PracticeQuestion | null;
  word: PracticeWord | null;
  visualCuesEnabled: boolean;
  visualCuePreferences: VisualCuePreferences;
  visualCue: VisualCue | null;
  round: RoundSessionView | null;
}

export interface RoundSessionView {
  roundId: string;
  status: PracticeRoundRow["status"];
  currentStep: RoundLearningStep;
  wordCount: number;
  cardViewCounts: Record<string, number>;
  cards: RoundLearnCardView[];
  selectedCard: RoundLearnCardView | null;
  canUnlockMeaning: boolean;
  question: PracticeQuestion | null;
  word: PracticeWord | null;
  passNumber: number | null;
  currentPassWordIds: string[];
  attemptNumberForWordInStep: number | null;
  isRetryPass: boolean;
  remainingInPass: number;
  stepProgressLabel: string;
}

export interface RoundLearnCardView {
  id: string;
  word: string;
  definition: string;
  example: string;
  synonyms: string[];
  antonyms: string[];
  confusables: string[];
  viewCount: number;
  visualCue: VisualCue | null;
  supportMode: LearnCardSupportMode;
  activeRecallPrompt: string;
  selectionReason: RoundSelectionReason | null;
  history: {
    attemptCount: number;
    correctCount: number;
    wrongCount: number;
    masteryColour: LearnerWordState["masteryColour"] | null;
  };
}

export interface AttemptReview {
  sessionId: string;
  attemptId: string;
  questionNumber: number;
  totalQuestions: number;
  isSessionComplete: boolean;
  questionType: QuestionType;
  prompt: string;
  instruction: string;
  choices: string[];
  targetWord: string;
  visualCuesEnabled: boolean;
  visualCuePreferences: VisualCuePreferences;
  visualCue: VisualCue | null;
  submittedAnswer: string;
  canonicalAnswer: string;
  targetDefinition: string | null;
  targetExample: string | null;
  submittedWordDefinition: {
    word: string;
    definition: string;
  } | null;
  isCorrect: boolean;
  failureType: FailureType;
  hintLevelUsed: number;
  hints: string[];
  roundStep: RoundLearningStep | null;
  passNumber: number | null;
  attemptNumberForWordInStep: number | null;
  firstAttemptCorrect: boolean | null;
  eventuallyCorrect: boolean | null;
  revealAndMoveOn: boolean;
}

export type SubmitSessionAnswerResult = {
  completed: boolean;
  attemptId: string | null;
  isCorrect: boolean | null;
  questionType: QuestionType | null;
  roundStep: RoundLearningStep | null;
  passNumber: number | null;
};

export interface ParentWordListItem {
  id: string;
  word: string;
  definition: string | null;
  example: string | null;
  masteryColour: LearnerWordState["masteryColour"] | null;
  difficultyLevel: number;
  isComplete: boolean;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  lastSeenAt: string | null;
  /** Plain-English reasons the colour landed where it did (for tooltips). */
  scoreReasons: string[];
  /** Wilson lower bound (0–1) used to bucket the colour. 0 when untouched. */
  scoreLowerBound: number;
  priorityMode: "normal" | "next_round_once";
}

export interface ParentWordEditItem {
  id: string;
  word: string;
  definition: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
}

export interface ParentDashboard {
  learnerId: string;
  learnerName: string;
  totalWords: number;
  completeWords: number;
  visualCuesEnabled: boolean;
  visualCueGenerationEnabled: boolean;
  visualCuePreferences: VisualCuePreferences;
  nextRoundMix: NextRoundMixPreference;
  latestSession: {
    startedAt: string;
    actualQuestionCount: number;
    summary: SessionSummary;
  } | null;
  redOrangeWords: ParentWordListItem[];
  dueWords: ParentWordListItem[];
  closeToGreen: ParentWordListItem[];
  latestRound: SessionSummary["round"] | null;
}

export interface WordFormInput {
  word: string;
  definition?: string;
  example?: string;
  examples?: string[];
  synonym?: string;
  synonyms?: string[];
  antonym?: string;
  antonyms?: string[];
  confusable?: string;
  confusables?: string[];
  difficultyLevel?: number;
}

export interface ParentExampleVisualCueInput {
  exampleIndex: number;
  provider: string;
  model: string;
  promptVersion: string;
  prompt: string;
  imagePath: string;
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

export function getVisualCuePreference(): VisualCuePreferences {
  return getVisualCuePreferenceFromDb(getDb(), defaultLearnerId());
}

export function getVisualCueGenerationPreference(): boolean {
  return getVisualCueGenerationPreferenceFromDb(getDb(), defaultLearnerId());
}

export function setVisualCuePreference(
  preferences: Pick<VisualCuePreferences, "learnCards" | "meaningQuestions" | "contextQuestions"> & {
    generationEnabled?: boolean;
  },
  learnerId = defaultLearnerId()
): void {
  const db = getDb();
  const enabled = preferences.learnCards || preferences.meaningQuestions || preferences.contextQuestions;
  db.prepare(
    `UPDATE learner_profiles
     SET visual_cues_enabled = ?,
         visual_cue_generation_enabled = ?,
         visual_cues_on_learn_cards = ?,
         visual_cues_on_meaning_questions = ?,
         visual_cues_on_context_questions = ?,
         updated_at = ?
     WHERE learner_id = ?`
  ).run(
    enabled ? 1 : 0,
    preferences.generationEnabled ? 1 : 0,
    preferences.learnCards ? 1 : 0,
    preferences.meaningQuestions ? 1 : 0,
    preferences.contextQuestions ? 1 : 0,
    new Date().toISOString(),
    learnerId
  );
}

export function setNextRoundMixPreference(
  preference: Partial<NextRoundMixPreference>,
  learnerId = defaultLearnerId()
): void {
  const db = getDb();
  const normalized = normalizeNextRoundMix(preference);
  db.prepare(
    `UPDATE learner_profiles
     SET next_round_new_count = ?,
         next_round_recovery_count = ?,
         next_round_review_count = ?,
         next_round_stable_count = ?,
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
  abandonUnstartedPreviewRound(db, learnerId);
}

export function getMissionPreview(targetQuestionCount = 12, learnerId = defaultLearnerId()): MissionPreview {
  const db = getDb();
  const words = getPracticeWordsForSelection(db, learnerId);
  const byId = new Map(words.map((word) => [word.id, word]));

  // Make sure a round is committed before we render anything: this way
  // 'today's words' on the cover are exactly the words the learner will
  // load on Start. Without this, the cover and the started round each
  // run the selector independently and the random tie-break causes them
  // to disagree.
  abandonStaleInProgressRounds(db, targetQuestionCount, learnerId);
  abandonUnstartedPreviewRoundForPendingParentPriority(db, learnerId);
  if (!hasInProgressRound(db, learnerId)) {
    startRoundMission(targetQuestionCount, learnerId);
  }
  const liveRound = db
    .prepare(
      `SELECT word_ids_json, summary_json
       FROM practice_rounds
       WHERE learner_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get(learnerId) as
    | { word_ids_json: string; summary_json: string }
    | undefined;

  const nowIso = new Date().toISOString();
  const selection: RoundWordSelection = liveRound
    ? roundSelectionFromLiveRound(liveRound, byId)
    : selectRoundWordsWithParentPriority(db, words, nowIso, targetQuestionCount, learnerId);
  const reasonByWordId = new Map(selection.reasons.map((reason) => [reason.wordId, reason]));
  const attemptsByWordId = loadAttemptHistoryByWord(db, learnerId);
  const realAttemptsByWordId = new Map(
    (db
      .prepare(
        `SELECT word_id, COUNT(*) AS n FROM practice_attempts
         WHERE learner_id = ? GROUP BY word_id`
      )
      .all(learnerId) as Array<{ word_id: string; n: number }>).map(
      (row) => [row.word_id, row.n]
    )
  );

  return {
    targetQuestionCount: selection.wordIds.length,
    words: selection.wordIds.map((wordId) => {
      const word = byId.get(wordId);
      const selectionReason = reasonByWordId.get(wordId);
      if (!word) throw new Error(`Missing planned word ${wordId}`);
      if (!selectionReason) throw new Error(`Missing round selection reason for ${wordId}`);
      const realAttempts = realAttemptsByWordId.get(word.id) ?? 0;
      const wordAttempts = attemptsByWordId.get(word.id) ?? null;
      const priority = priorityBreakdownForState(word, wordAttempts, nowIso);
      return {
        id: word.id,
        word: word.word,
        definition: word.definition,
        // Recompute live so child surfaces match the parent dashboard.
        // Only treat the word as "started" when a real attempt exists in
        // practice_attempts — legacy state stubs are ignored.
        masteryColour:
          realAttempts === 0
            ? null
            : masteryColourForState(word.state, wordAttempts),
        selectionReason,
        priorityFactors: priority.factors,
        priorityScore: priority.score,
      };
    })
  };
}

function hasInProgressRound(db: DatabaseSync, learnerId = defaultLearnerId()): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS x FROM practice_rounds
       WHERE learner_id = ? AND status = 'in_progress'
       LIMIT 1`
    )
    .get(learnerId) as { x: number } | undefined;
  return Boolean(row);
}

function roundSelectionFromLiveRound(
  row: { word_ids_json: string; summary_json: string },
  byId: Map<string, PracticeWord>
): RoundWordSelection {
  const wordIds = (JSON.parse(row.word_ids_json) as string[]).filter((id) =>
    byId.has(id)
  );
  const stored = JSON.parse(row.summary_json) as SessionSummary;
  const reasonsByWordId = new Map(
    (stored.round?.selectionReasons ?? []).map((reason) => [reason.wordId, reason])
  );
  const reasons: RoundSelectionReason[] = wordIds.map((wordId) => {
    const word = byId.get(wordId);
    const stored = reasonsByWordId.get(wordId);
    if (stored) return stored;
    return {
      wordId,
      word: word?.word ?? wordId,
      reason: "priority",
      label: "Already in this round",
      detail: "Carried over from the round you started earlier."
    };
  });
  return { wordIds, reasons };
}

function selectRoundWordsWithParentPriority(
  db: DatabaseSync,
  words: PracticeWord[],
  nowIso: string,
  targetCount: number,
  learnerId: string
): RoundWordSelection {
  const count = Math.max(6, Math.min(12, Math.round(targetCount)));
  const byId = new Map(words.map((word) => [word.id, word]));
  const priorityIds = getVocabularyNextRoundPriorityWordIds(db, learnerId)
    .filter((wordId) => byId.has(wordId))
    .slice(0, Math.min(3, count));
  const prioritySet = new Set(priorityIds);
  const bucketTargets = getAdjustedBucketTargetsForFill(
    getNextRoundMixPreferenceFromDb(db, learnerId),
    priorityIds.map((wordId) => byId.get(wordId)).filter((word): word is PracticeWord => Boolean(word)),
    nowIso
  );
  const fillCount = count - priorityIds.length;
  const remainingSelection = selectRoundWords(
    words.filter((word) => !prioritySet.has(word.id)),
    nowIso,
    fillCount,
    getRemediationWordIds(db, learnerId),
    { bucketTargets, allowPartialCount: true }
  );
  const fillIds = remainingSelection.wordIds.filter((wordId) => !prioritySet.has(wordId)).slice(0, fillCount);
  const fillIdSet = new Set(fillIds);

  return {
    wordIds: [...priorityIds, ...fillIds],
    reasons: [
      ...priorityIds.map((wordId) => parentNextRoundReason(byId.get(wordId) ?? null, wordId)),
      ...remainingSelection.reasons.filter((reason) => fillIdSet.has(reason.wordId))
    ]
  };
}

function getAdjustedBucketTargetsForFill(
  mix: NextRoundMixPreference,
  priorityWords: PracticeWord[],
  nowIso: string
): NextRoundMixPreference {
  const adjusted = { ...mix };
  for (const word of priorityWords) {
    const bucket = selectionBucketForWord(word, nowIso);
    adjusted[bucket] = Math.max(0, adjusted[bucket] - 1);
  }
  return adjusted;
}

function getVocabularyNextRoundPriorityWordIds(db: DatabaseSync, learnerId: string): string[] {
  const rows = db
    .prepare(
      `SELECT lvw.word_id
       FROM learner_vocabulary_words lvw
       JOIN words w ON w.id = lvw.word_id AND w.status = 'active'
       JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       WHERE lvw.learner_id = ?
         AND lvw.status = 'active'
         AND lvw.priority_mode = 'next_round_once'
         AND EXISTS (SELECT 1 FROM word_examples e WHERE e.word_id = w.id AND e.status = 'approved')
       ORDER BY lvw.priority_requested_at ASC, w.word ASC`
    )
    .all(learnerId) as Array<{ word_id: string }>;
  return rows.map((row) => row.word_id);
}

function parentNextRoundReason(word: PracticeWord | null, wordId: string): RoundSelectionReason {
  return {
    wordId,
    word: word?.word ?? wordId,
    reason: "parent_next_round",
    label: "Picked for next round",
    detail: "This active word was requested for one upcoming mission; mastery scoring was not changed."
  };
}

function consumeVocabularyNextRoundPriorities(db: DatabaseSync, learnerId: string, wordIds: string[], now: string): void {
  if (wordIds.length === 0) return;
  const placeholders = wordIds.map(() => "?").join(", ");
  db.prepare(
    `UPDATE learner_vocabulary_words
     SET priority_mode = 'normal',
         priority_consumed_at = ?,
         updated_at = ?
     WHERE learner_id = ?
       AND priority_mode = 'next_round_once'
       AND word_id IN (${placeholders})`
  ).run(now, now, learnerId, ...wordIds);
}

export function startRoundMission(roundWordCount = 12, learnerId = defaultLearnerId()): string {
  const db = getDb();
  abandonStaleInProgressRounds(db, roundWordCount, learnerId);
  abandonUnstartedPreviewRoundForPendingParentPriority(db, learnerId);

  // Reuse the in-progress round if one already exists. The cover preview
  // commits one when the user lands on /child, so the words shown there
  // are exactly the words this action navigates to.
  const existing = db
    .prepare(
      `SELECT session_id FROM practice_rounds
       WHERE learner_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1`
    )
    .get(learnerId) as { session_id: string } | undefined;
  if (existing) return existing.session_id;

  const words = getPracticeWordsForSelection(db, learnerId);
  const now = new Date().toISOString();
  const selection = selectRoundWordsWithParentPriority(db, words, now, roundWordCount, learnerId);
  const wordIds = selection.wordIds;
  if (wordIds.length === 0) {
    throw new Error("No complete vocabulary words are available for a round.");
  }

  const sessionId = randomUUID();
  const roundId = randomUUID();
  const plan: SessionPlanItem[] = wordIds.flatMap((wordId) => [
    { wordId, questionType: "definition_choice" },
    { wordId, questionType: "fill_sentence" }
  ]);
  const summary: SessionSummary = {
    plan,
    round: {
      roundId,
      firstAttemptSecureWords: [],
      eventuallyCorrectWords: [],
      revealAndMoveOnWords: [],
      nearReviewWords: [],
      selectionReasons: selection.reasons,
      mistakeEvidence: [],
      explanation: "Round started. The word list is selected from recent mistakes, due reviews, and building words."
    }
  };

  db.prepare(
    `INSERT INTO practice_sessions
      (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, summary_json, created_at, updated_at)
     VALUES (?, ?, 'daily_mission', 'in_progress', ?, 0, ?, ?, ?, ?)`
  ).run(sessionId, learnerId, plan.length, now, JSON.stringify(summary), now, now);

  db.prepare(
    `INSERT INTO practice_rounds
      (id, session_id, learner_id, status, current_step, max_retry_passes, word_ids_json,
       card_view_counts_json, started_at, summary_json, created_at, updated_at)
     VALUES (?, ?, ?, 'in_progress', 'learn_cards', ?, ?, '{}', ?, ?, ?, ?)`
  ).run(
    roundId,
    sessionId,
    learnerId,
    DEFAULT_ROUND_MAX_RETRY_PASSES,
    JSON.stringify(wordIds),
    now,
    JSON.stringify(summary),
    now,
    now
  );

  consumeVocabularyNextRoundPriorities(db, learnerId, selection.wordIds, now);

  return sessionId;
}

function abandonStaleInProgressRounds(
  db: DatabaseSync,
  expectedWordCount = 12,
  learnerId = defaultLearnerId()
): void {
  const rows = db
    .prepare(
      `SELECT id, session_id, started_at, current_step, card_view_counts_json, summary_json,
              json_array_length(word_ids_json) AS word_count,
              EXISTS (SELECT 1 FROM practice_attempts pa WHERE pa.session_id = practice_rounds.session_id) AS has_attempts
       FROM practice_rounds
       WHERE learner_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC, created_at DESC`
    )
    .all(learnerId) as Array<{
      id: string;
      session_id: string;
      started_at: string;
      current_step: string;
      card_view_counts_json: string;
      summary_json: string;
      word_count: number;
      has_attempts: number;
    }>;
  if (rows.length === 0) return;

  const latestCompleted = db
    .prepare(
      `SELECT MAX(ended_at) AS ended_at
       FROM practice_rounds
       WHERE learner_id = ? AND status = 'completed'`
    )
    .get(learnerId) as { ended_at: string | null } | undefined;
  const latestCompletedAt = latestCompleted?.ended_at
    ? new Date(latestCompleted.ended_at).getTime()
    : null;

  const stillCurrent = rows.filter((row) => {
    if (row.word_count !== expectedWordCount) return false;
    if (isStaleUnstartedPreviewRound(row, Date.now())) return false;
    if (isUnstartedPreviewRound(row) && lacksNewWordPick(row) && learnerHasUnpracticedWords(db, learnerId)) {
      return false;
    }
    if (!latestCompletedAt) return true;
    const startedAt = new Date(row.started_at).getTime();
    return Number.isFinite(startedAt) && startedAt > latestCompletedAt;
  });
  const keepRoundId = stillCurrent[0]?.id ?? null;
  const stale = rows.filter((row) => row.id !== keepRoundId);
  if (stale.length === 0) return;

  const now = new Date().toISOString();
  for (const row of stale) {
    db.prepare(
      `UPDATE practice_rounds
       SET status = 'abandoned', ended_at = ?, updated_at = ?
       WHERE id = ? AND status = 'in_progress'`
    ).run(now, now, row.id);
    db.prepare(
      `UPDATE practice_sessions
       SET status = 'abandoned', ended_at = ?, updated_at = ?
       WHERE id = ? AND status = 'in_progress'`
    ).run(now, now, row.session_id);
  }
}

function isStaleUnstartedPreviewRound(
  row: {
    started_at: string;
    current_step: string;
    card_view_counts_json: string;
    has_attempts: number;
  },
  nowMs: number
): boolean {
  if (!isUnstartedPreviewRound(row)) return false;

  const startedAt = new Date(row.started_at).getTime();
  if (!Number.isFinite(startedAt)) return true;
  const ageHours = (nowMs - startedAt) / 3_600_000;
  return ageHours >= UNSTARTED_PREVIEW_STALE_HOURS;
}

function isUnstartedPreviewRound(row: {
  current_step: string;
  card_view_counts_json: string;
  has_attempts: number;
}): boolean {
  if (row.current_step !== "learn_cards") return false;
  if (row.has_attempts) return false;

  const cardViewCounts = JSON.parse(row.card_view_counts_json) as Record<string, number>;
  return !Object.values(cardViewCounts).some((count) => count > 0);
}

function lacksNewWordPick(row: { summary_json: string }): boolean {
  const summary = JSON.parse(row.summary_json) as SessionSummary;
  return !(summary.round?.selectionReasons ?? []).some((reason) => reason.reason === "new_word");
}

function learnerHasUnpracticedWords(db: DatabaseSync, learnerId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS x
       FROM learner_vocabulary_words lvw
       JOIN words w ON w.id = lvw.word_id AND w.status = 'active'
       JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       JOIN learner_word_state s ON s.word_id = w.id AND s.learner_id = lvw.learner_id
       WHERE lvw.learner_id = ?
         AND lvw.status = 'active'
         AND s.attempt_count = 0
         AND s.last_exposed_at IS NULL
         AND EXISTS (SELECT 1 FROM word_examples e WHERE e.word_id = w.id AND e.status = 'approved')
       LIMIT 1`
    )
    .get(learnerId) as { x: number } | undefined;
  return Boolean(row);
}

function abandonUnstartedPreviewRound(db: DatabaseSync, learnerId: string): void {
  const liveRound = db
    .prepare(
      `SELECT pr.id, pr.session_id, pr.card_view_counts_json
       FROM practice_rounds pr
       WHERE pr.learner_id = ?
         AND pr.status = 'in_progress'
         AND pr.current_step = 'learn_cards'
         AND NOT EXISTS (
           SELECT 1 FROM practice_attempts pa WHERE pa.session_id = pr.session_id
         )
       ORDER BY pr.started_at DESC, pr.created_at DESC
       LIMIT 1`
    )
    .get(learnerId) as
    | { id: string; session_id: string; card_view_counts_json: string }
    | undefined;
  if (!liveRound) return;

  const cardViewCounts = JSON.parse(liveRound.card_view_counts_json) as Record<string, number>;
  if (Object.values(cardViewCounts).some((count) => count > 0)) return;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE practice_rounds
     SET status = 'abandoned', ended_at = ?, updated_at = ?
     WHERE id = ? AND status = 'in_progress'`
  ).run(now, now, liveRound.id);
  db.prepare(
    `UPDATE practice_sessions
     SET status = 'abandoned', ended_at = ?, updated_at = ?
     WHERE id = ? AND status = 'in_progress'`
  ).run(now, now, liveRound.session_id);
}

function abandonUnstartedPreviewRoundForPendingParentPriority(db: DatabaseSync, learnerId: string): void {
  const pending = db
    .prepare(
      `SELECT lvw.word_id, lvw.priority_requested_at
       FROM learner_vocabulary_words lvw
       JOIN words w ON w.id = lvw.word_id AND w.status = 'active'
       WHERE lvw.learner_id = ?
         AND lvw.status = 'active'
         AND lvw.priority_mode = 'next_round_once'
         AND lvw.priority_requested_at IS NOT NULL
       ORDER BY lvw.priority_requested_at ASC
       LIMIT 3`
    )
    .all(learnerId) as Array<{ word_id: string; priority_requested_at: string }>;
  if (pending.length === 0) return;

  const liveRound = db
    .prepare(
      `SELECT pr.id, pr.session_id, pr.word_ids_json, pr.card_view_counts_json, pr.started_at
       FROM practice_rounds pr
       WHERE pr.learner_id = ?
         AND pr.status = 'in_progress'
         AND pr.current_step = 'learn_cards'
         AND NOT EXISTS (
           SELECT 1 FROM practice_attempts pa WHERE pa.session_id = pr.session_id
         )
       ORDER BY pr.started_at DESC, pr.created_at DESC
       LIMIT 1`
    )
    .get(learnerId) as
    | { id: string; session_id: string; word_ids_json: string; card_view_counts_json: string; started_at: string }
    | undefined;
  if (!liveRound) return;

  const cardViewCounts = JSON.parse(liveRound.card_view_counts_json) as Record<string, number>;
  if (Object.values(cardViewCounts).some((count) => count > 0)) return;

  const liveWordIds = new Set(JSON.parse(liveRound.word_ids_json) as string[]);
  const needsNewPreview = pending.some((row) => {
    const requestedAt = new Date(row.priority_requested_at).getTime();
    const startedAt = new Date(liveRound.started_at).getTime();
    return !liveWordIds.has(row.word_id) || (Number.isFinite(requestedAt) && Number.isFinite(startedAt) && requestedAt > startedAt);
  });
  if (!needsNewPreview) return;

  const now = new Date().toISOString();
  db.prepare(
    `UPDATE practice_rounds
     SET status = 'abandoned', ended_at = ?, updated_at = ?
     WHERE id = ? AND status = 'in_progress'`
  ).run(now, now, liveRound.id);
  db.prepare(
    `UPDATE practice_sessions
     SET status = 'abandoned', ended_at = ?, updated_at = ?
     WHERE id = ? AND status = 'in_progress'`
  ).run(now, now, liveRound.session_id);
}

export function getSessionView(sessionId: string, selectedCardId?: string): SessionView {
  const db = getDb();
  const session = getSessionRow(db, sessionId);
  const round = getRoundRowForSession(db, sessionId);
  const visualCuePreferences = getVisualCuePreferenceFromDb(db, session.learner_id);
  if (round) {
    return getRoundSessionView(db, session, round, selectedCardId, visualCuePreferences);
  }

  const plan = readSessionPlan(session);
  const attempts = getSessionAttemptCount(db, sessionId);
  const planWordIds = plan.map((item) => item.wordId);
  const words = getCommittedPracticeWords(db, session.learner_id, planWordIds);
  const wordMap = new Map(words.map((word) => [word.id, word]));

  if (session.status !== "in_progress" || attempts >= plan.length) {
    return {
      sessionId,
      status: session.status,
      questionNumber: Math.min(attempts, plan.length),
      totalQuestions: plan.length,
      question: null,
      word: null,
      visualCuesEnabled: visualCuePreferences.enabled,
      visualCuePreferences,
      visualCue: null,
      mode: "daily_mission",
      round: null
    };
  }

  const current = plan[attempts];
  const word = wordMap.get(current.wordId);
  if (!word) throw new Error(`Session word ${current.wordId} is not available.`);
  const question = generateQuestion(current.questionType, word, words);

  return {
    sessionId,
    status: session.status,
    questionNumber: attempts + 1,
    totalQuestions: plan.length,
    question,
    word,
    visualCuesEnabled: visualCuePreferences.enabled,
    visualCuePreferences,
    visualCue: shouldShowVisualCueForQuestion(question, visualCuePreferences) ? getVisualCueForQuestion(db, question, word.word) : null,
    mode: "daily_mission",
    round: null
  };
}

export function submitSessionAnswer(input: {
  sessionId: string;
  submittedAnswer: string;
  hintLevelUsed: number;
  responseTimeMs: number;
}): SubmitSessionAnswerResult {
  const db = getDb();
  const session = getSessionRow(db, input.sessionId);
  const round = getRoundRowForSession(db, input.sessionId);
  if (round) return submitRoundAnswer(db, session, round, input);

  if (session.status !== "in_progress") return { completed: true, attemptId: null, isCorrect: null, questionType: null, roundStep: null, passNumber: null };

  const plan = readSessionPlan(session);
  const attemptIndex = getSessionAttemptCount(db, input.sessionId);
  const current = plan[attemptIndex];
  if (!current) {
    completeSession(db, session.id);
    return { completed: true, attemptId: null, isCorrect: null, questionType: null, roundStep: null, passNumber: null };
  }

  const words = getCommittedPracticeWords(db, session.learner_id, plan.map((item) => item.wordId));
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

  const attemptId = randomUUID();
  db.prepare(
    `INSERT INTO practice_attempts
      (id, session_id, learner_id, word_id, question_type, prompt_json, expected_answer_json,
       submitted_answer, is_correct, hint_level_used, max_hint_level_available, response_time_ms, failure_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    session.id,
    session.learner_id,
    word.id,
    current.questionType,
    JSON.stringify({
      prompt: question.prompt,
      instruction: question.instruction,
      choices: question.choices,
      hints: question.hints,
      targetWord: question.targetWord,
      selectedExampleId: question.selectedExampleId
    }),
    JSON.stringify({ expectedAnswers: question.expectedAnswers, canonicalAnswer: question.canonicalAnswer }),
    input.submittedAnswer,
    assessment.isCorrect ? 1 : 0,
    input.hintLevelUsed,
    question.hints.length,
    input.responseTimeMs,
    assessment.failureType,
    now
  );

  const actualCount = attemptIndex + 1;
  saveLearnerWordState(
    db,
    applyPracticeEventToSelectionState(updateStateAfterAttempt(word.state, outcome), word.state, {
      answeredAt: now,
      isCorrect: assessment.isCorrect,
      hintLevelUsed: input.hintLevelUsed,
      revealAndMoveOn: false,
      firstAttemptCorrect: assessment.isCorrect,
      sessionId: session.id,
      interactionIndex: actualCount
    })
  );

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

  return { completed, attemptId, isCorrect: assessment.isCorrect, questionType: current.questionType, roundStep: null, passNumber: null };
}

export function recordRoundCardView(sessionId: string, wordId: string): void {
  const db = getDb();
  const round = getRoundRowForSession(db, sessionId);
  if (!round || round.status !== "in_progress" || round.current_step !== "learn_cards") return;

  const wordIds = readRoundWordIds(round);
  if (!wordIds.includes(wordId)) throw new Error(`Word ${wordId} is not part of round ${round.id}`);

  const counts = readCardViewCounts(round);
  counts[wordId] = (counts[wordId] ?? 0) + 1;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE practice_rounds
     SET card_view_counts_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(JSON.stringify(counts), now, round.id);

  const state = getStateForWord(db, wordId, round.learner_id);
  saveLearnerWordState(db, {
    ...state,
    lastExposedAt: now,
    lastPracticedAt: now,
    lastPracticedSessionId: sessionId,
    lastPracticedInteractionIndex: Object.values(counts).reduce((sum, count) => sum + count, 0)
  });
}

export function startRoundMeaningRecognition(sessionId: string): void {
  const db = getDb();
  const round = getRoundRowForSession(db, sessionId);
  if (!round || round.status !== "in_progress" || round.current_step !== "learn_cards") return;

  const wordIds = readRoundWordIds(round);
  if (!canUnlockMeaningStep(readCardViewCounts(round), wordIds)) {
    throw new Error("Every round card must be reviewed twice before meaning recognition starts.");
  }

  db.prepare("UPDATE practice_rounds SET current_step = 'meaning_recognition', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    round.id
  );
}

export function getAttemptReview(sessionId: string, attemptId: string): AttemptReview {
  const db = getDb();
  const session = getSessionRow(db, sessionId);
  const visualCuePreferences = getVisualCuePreferenceFromDb(db, session.learner_id);
  const plan = readSessionPlan(session);
  const row = db
    .prepare(
      `SELECT a.id, a.session_id, a.word_id, a.question_type, a.prompt_json, a.expected_answer_json,
              a.submitted_answer, a.is_correct, a.hint_level_used, a.failure_type, a.created_at,
              a.round_step, a.pass_number, a.attempt_number_for_word_in_step,
              a.first_attempt_correct, a.eventually_correct, a.reveal_and_move_on,
              w.word, d.definition,
              (SELECT e.sentence
               FROM word_examples e
               WHERE e.word_id = w.id AND e.status = 'approved'
               ORDER BY e.id ASC
               LIMIT 1) AS example
       FROM practice_attempts a
       JOIN words w ON w.id = a.word_id
       LEFT JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       WHERE a.session_id = ? AND a.id = ?`
    )
    .get(sessionId, attemptId) as unknown as
    | {
        id: string;
        session_id: string;
        word_id: string;
        question_type: QuestionType;
        prompt_json: string;
        expected_answer_json: string;
        submitted_answer: string | null;
        is_correct: number;
        hint_level_used: number;
        failure_type: FailureType;
        created_at: string;
        round_step: RoundLearningStep | null;
        pass_number: number | null;
        attempt_number_for_word_in_step: number | null;
        first_attempt_correct: number | null;
        eventually_correct: number | null;
        reveal_and_move_on: number;
        word: string;
        definition: string | null;
        example: string | null;
      }
    | undefined;

  if (!row) throw new Error(`Unknown attempt ${attemptId} for session ${sessionId}`);

  const prompt = JSON.parse(row.prompt_json) as {
    prompt?: string;
    instruction?: string;
    choices?: string[];
    hints?: string[];
    targetWord?: string;
    selectedExampleId?: string | null;
  };
  const expected = JSON.parse(row.expected_answer_json) as {
    canonicalAnswer?: string;
  };
  const attemptIds = db
    .prepare("SELECT id FROM practice_attempts WHERE session_id = ? ORDER BY created_at ASC, id ASC")
    .all(sessionId) as unknown as Array<{ id: string }>;
  const questionNumber = Math.max(1, attemptIds.findIndex((attempt) => attempt.id === attemptId) + 1);
  const isRoundAttempt = row.round_step !== null;
  const submittedWord = getPracticeWords(session.learner_id).find(
    (word) => normalizeWord(word.word) === normalizeWord(row.submitted_answer ?? "")
  );
  const submittedWordDefinition =
    submittedWord && normalizeWord(submittedWord.word) !== normalizeWord(row.word)
      ? { word: submittedWord.word, definition: submittedWord.definition }
      : null;

  return {
    sessionId,
    attemptId,
    questionNumber,
    totalQuestions: isRoundAttempt ? Math.max(plan.length, attemptIds.length) : plan.length,
    isSessionComplete: isRoundAttempt ? session.status === "completed" : session.status === "completed" || questionNumber >= plan.length,
    questionType: row.question_type,
    prompt: prompt.prompt ?? "",
    instruction: prompt.instruction ?? "",
    choices: prompt.choices ?? [],
    targetWord: prompt.targetWord ?? row.word,
    visualCuesEnabled: visualCuePreferences.enabled,
    visualCuePreferences,
    visualCue: shouldShowVisualCueForAttempt(row.question_type, row.round_step, visualCuePreferences)
      ? getVisualCueForExample(db, prompt.selectedExampleId ?? null, row.word)
      : null,
    submittedAnswer: row.submitted_answer ?? "",
    canonicalAnswer: expected.canonicalAnswer ?? row.word,
    targetDefinition: row.definition,
    targetExample: row.example,
    submittedWordDefinition,
    isCorrect: row.is_correct === 1,
    failureType: row.failure_type,
    hintLevelUsed: row.hint_level_used,
    hints: prompt.hints ?? [],
    roundStep: row.round_step,
    passNumber: row.pass_number,
    attemptNumberForWordInStep: row.attempt_number_for_word_in_step,
    firstAttemptCorrect: row.first_attempt_correct === null ? null : row.first_attempt_correct === 1,
    eventuallyCorrect: row.eventually_correct === null ? null : row.eventually_correct === 1,
    revealAndMoveOn: row.reveal_and_move_on === 1
  };
}

export function getSessionSummary(sessionId: string): SessionSummary {
  const db = getDb();
  const session = getSessionRow(db, sessionId);
  return JSON.parse(session.summary_json) as SessionSummary;
}

export function getParentDashboard(learnerId = defaultLearnerId()): ParentDashboard {
  const db = getDb();
  const words = getParentWords(learnerId);
  const visualCuePreferences = getVisualCuePreferenceFromDb(db, learnerId);
  const visualCueGenerationEnabled = getVisualCueGenerationPreferenceFromDb(db, learnerId);
  const nextRoundMix = getNextRoundMixPreferenceFromDb(db, learnerId);
  const learner = db.prepare("SELECT display_name FROM learners WHERE id = ?").get(learnerId) as
    | { display_name: string }
    | undefined;
  const totalWords = words.length;
  const completeWords = words.filter((word) => word.isComplete).length;
  const redOrangeWords = words.filter((word) => word.masteryColour === "red" || word.masteryColour === "orange").slice(0, 12);
  const closeToGreen = words.filter((word) => word.masteryColour === "light_green").slice(0, 8);
  const dueWords = words
    .filter((word) => {
      const row = db
        .prepare("SELECT next_review_at FROM learner_word_state WHERE learner_id = ? AND word_id = ?")
        .get(learnerId, word.id) as { next_review_at: string | null } | undefined;
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
    .get(learnerId) as unknown as
    | { started_at: string; actual_question_count: number; summary_json: string }
    | undefined;

  const latestRoundRow = db
    .prepare(
      `SELECT summary_json
       FROM practice_rounds
       WHERE learner_id = ? AND status = 'completed'
       ORDER BY ended_at DESC, started_at DESC
       LIMIT 1`
    )
    .get(learnerId) as { summary_json: string } | undefined;
  const latestRound = latestRoundRow
    ? ((JSON.parse(latestRoundRow.summary_json) as SessionSummary).round ?? null)
    : null;

  return {
    learnerId,
    learnerName: learner?.display_name ?? "Learner",
    totalWords,
    completeWords,
    visualCuesEnabled: visualCuePreferences.enabled,
    visualCueGenerationEnabled,
    visualCuePreferences,
    nextRoundMix,
    latestSession: latest
      ? {
          startedAt: latest.started_at,
          actualQuestionCount: latest.actual_question_count,
          summary: JSON.parse(latest.summary_json) as SessionSummary
        }
      : null,
    redOrangeWords,
    dueWords,
    closeToGreen,
    latestRound
  };
}

export function getParentWords(learnerId = defaultLearnerId()): ParentWordListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.difficulty_level, d.definition,
              (SELECT e.sentence
               FROM word_examples e
               WHERE e.word_id = w.id AND e.status = 'approved'
               ORDER BY e.id ASC
               LIMIT 1) AS example,
              s.stability_days, s.attempt_count, s.correct_count, s.wrong_count,
              s.last_hint_level_used, s.average_hint_level_used,
              s.average_response_time_ms, s.last_seen_at, s.last_correct_at,
              s.last_wrong_at, s.next_review_at, s.failure_types_json,
              s.confused_with_word_ids_json, s.near_review,
              s.eligible_questions_since_last_mistake, s.mastery_colour,
              (SELECT COUNT(*) FROM practice_attempts pa
                 WHERE pa.word_id = w.id AND pa.learner_id = ?) AS real_attempts,
              (SELECT COUNT(*) FROM practice_attempts pa
                 WHERE pa.word_id = w.id AND pa.learner_id = ? AND pa.is_correct = 1) AS real_correct,
              (SELECT COUNT(*) FROM practice_attempts pa
                 WHERE pa.word_id = w.id AND pa.learner_id = ? AND pa.is_correct = 0) AS real_wrong,
              lvw.priority_mode
       FROM words w
       JOIN learner_vocabulary_words lvw ON lvw.word_id = w.id AND lvw.learner_id = ? AND lvw.status = 'active'
       LEFT JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       LEFT JOIN learner_word_state s ON s.word_id = w.id AND s.learner_id = ?
       WHERE w.status = 'active'
       ORDER BY w.word ASC`
    )
    .all(learnerId, learnerId, learnerId, learnerId, learnerId) as unknown as Array<{
    id: string;
    word: string;
    difficulty_level: number;
    definition: string | null;
    example: string | null;
    stability_days: number | null;
    attempt_count: number | null;
    correct_count: number | null;
    wrong_count: number | null;
    last_hint_level_used: number | null;
    average_hint_level_used: number | null;
    average_response_time_ms: number | null;
    last_seen_at: string | null;
    last_correct_at: string | null;
    last_wrong_at: string | null;
    next_review_at: string | null;
    failure_types_json: string | null;
    confused_with_word_ids_json: string | null;
    near_review: number | null;
    eligible_questions_since_last_mistake: number | null;
    mastery_colour: LearnerWordState["masteryColour"] | null;
    real_attempts: number;
    real_correct: number;
    real_wrong: number;
    priority_mode: "normal" | "next_round_once";
  }>;

  // Pull every attempt for this learner once, group by word, so we can
  // run the time-weighted scorer for each word without N+1 queries.
  const attemptsByWordId = loadAttemptHistoryByWord(db, learnerId);

  return rows.map((row) => {
    // "Started" means a real practice_attempts row exists, not just a
    // learner_word_state stub from card-view bookkeeping. This avoids
    // showing legacy or seeded stub state as if the learner had answered.
    const realAttempts = row.real_attempts;
    let masteryColour: LearnerWordState["masteryColour"] | null = null;
    let scoreReasons: string[] = ["Not started yet — first practice will set the colour."];
    let scoreLowerBound = 0;
    if (realAttempts > 0 && row.attempt_count !== null) {
      const state: LearnerWordState = {
        id: `state_${learnerId}_${row.id}`,
        learnerId,
        wordId: row.id,
        stabilityDays: row.stability_days ?? 1,
        masteryColour: row.mastery_colour ?? "red",
        lastSeenAt: row.last_seen_at,
        lastCorrectAt: row.last_correct_at,
        lastWrongAt: row.last_wrong_at,
        nextReviewAt: row.next_review_at,
        attemptCount: realAttempts,
        correctCount: row.real_correct,
        wrongCount: row.real_wrong,
        lastHintLevelUsed: row.last_hint_level_used,
        averageHintLevelUsed: row.average_hint_level_used ?? 0,
        averageResponseTimeMs: row.average_response_time_ms ?? 0,
        failureTypes: row.failure_types_json
          ? (JSON.parse(row.failure_types_json) as LearnerWordState["failureTypes"])
          : [],
        confusedWithWordIds: row.confused_with_word_ids_json
          ? (JSON.parse(row.confused_with_word_ids_json) as string[])
          : [],
        nearReview: row.near_review === 1,
        eligibleQuestionsSinceLastMistake: row.eligible_questions_since_last_mistake ?? 0,
        recoveryDebt: 0,
        lastPracticedAt: row.last_seen_at,
        lastCleanRetrievalAt: row.last_correct_at,
        lastSupportedSuccessAt: null,
        lastRevealedAt: null,
        lastExposedAt: row.last_seen_at,
        lastPracticedSessionId: null,
        lastPracticedInteractionIndex: null,
        learnerStateContentVersion: 1
      };
      const breakdown = scoreFromState(state, attemptsByWordId.get(row.id) ?? null);
      masteryColour = breakdown.colour ?? "red";
      scoreReasons = breakdown.reasons;
      scoreLowerBound = breakdown.lowerBound;
    }
    return {
      id: row.id,
      word: row.word,
      definition: row.definition,
      example: row.example,
      masteryColour,
      difficultyLevel: row.difficulty_level,
      isComplete: Boolean(row.definition && row.example),
      attemptCount: realAttempts,
      correctCount: row.real_correct,
      wrongCount: row.real_wrong,
      lastSeenAt: row.last_seen_at,
      scoreReasons,
      scoreLowerBound,
      priorityMode: row.priority_mode
    };
  });
}

export function getParentWordForEdit(wordId: string): ParentWordEditItem | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT w.id, w.word, d.definition
       FROM words w
       LEFT JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       WHERE w.id = ? AND w.status = 'active'`
    )
    .get(wordId) as
    | {
        id: string;
        word: string;
        definition: string | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    word: row.word,
    definition: row.definition ?? "",
    examples: getExamples(db, row.id),
    synonyms: getTextList(db, "word_synonyms", "synonym", row.id),
    antonyms: getTextList(db, "word_antonyms", "antonym", row.id)
  };
}

export interface WordDetailView {
  id: string;
  word: string;
  definition: string | null;
  example: string | null;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  confusables: string[];
  priorityMode: "normal" | "next_round_once";
  /** State snapshot at read time. */
  state: LearnerWordState | null;
  /** Live colour from the algorithm. */
  masteryColour: LearnerWordState["masteryColour"] | null;
  /** Score reasons (Wilson, recency, knockdown rules). */
  scoreReasons: string[];
  /** Wilson lower bound used for the colour. */
  scoreLowerBound: number;
  /** Recency-weighted effective sample size used by the scorer. */
  scoreEffectiveN: number;
  /** Selection-priority breakdown. */
  priorityScore: number;
  priorityFactors: Array<{
    name: string;
    value: number;
    weight: number;
    contribution: number;
    note: string;
  }>;
  /** Every recorded attempt, ordered most-recent-first. */
  attempts: Array<{
    id: string;
    answeredAt: string;
    questionType: QuestionType | null;
    isCorrect: boolean;
    hintLevelUsed: number;
    submittedAnswer: string | null;
    failureType: FailureType | null;
    roundStep: string | null;
    passNumber: number | null;
  }>;
  /** Where this word ranks against the rest of the deck for the *next* round. */
  rank: { rank: number; total: number };
  /** Probability of being picked in the next round (sigmoid of rank). */
  pickProbabilityNow: number;
  /** Day-by-day projection assuming the word is not practised. */
  projection: DayProjection[];
  /** What it would take to clear the next mastery bucket. */
  nextBucket: { label: string; threshold: number } | null;
  /** Top 12 of the deck right now, in priority order, with this word marked. */
  competitors: Array<{
    wordId: string;
    word: string;
    score: number;
    isThis: boolean;
    inNextRound: boolean;
  }>;
}

export function getWordDetail(wordId: string, learnerId = defaultLearnerId()): WordDetailView | null {
  const db = getDb();
  const wordRow = db
    .prepare(
      `SELECT w.id, w.word, w.difficulty_level, d.definition,
              (SELECT e.sentence
               FROM word_examples e
               WHERE e.word_id = w.id AND e.status = 'approved'
               ORDER BY e.id ASC
               LIMIT 1) AS example,
              COALESCE(lvw.priority_mode, 'normal') AS priority_mode
       FROM words w
       LEFT JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       LEFT JOIN learner_vocabulary_words lvw ON lvw.word_id = w.id AND lvw.learner_id = ?
       WHERE w.id = ? AND w.status = 'active'`
    )
    .get(learnerId, wordId) as
    | {
        id: string;
        word: string;
        difficulty_level: number;
        definition: string | null;
        example: string | null;
        priority_mode: "normal" | "next_round_once";
      }
    | undefined;
  if (!wordRow) return null;
  const examples = getExamples(db, wordRow.id);

  const synonyms = db
    .prepare(`SELECT synonym AS lemma FROM word_synonyms WHERE word_id = ?`)
    .all(wordId) as Array<{ lemma: string }>;
  const antonyms = db
    .prepare(`SELECT antonym AS lemma FROM word_antonyms WHERE word_id = ?`)
    .all(wordId) as Array<{ lemma: string }>;
  const confusables = db
    .prepare(
      `SELECT COALESCE(confusable_text, (SELECT word FROM words WHERE id = wc.confusable_word_id)) AS lemma
       FROM word_confusables wc
       WHERE word_id = ?`
    )
    .all(wordId) as Array<{ lemma: string | null }>;

  const stateRow = db
    .prepare(
      `SELECT * FROM learner_word_state WHERE learner_id = ? AND word_id = ?`
    )
    .get(learnerId, wordId) as StateRow | undefined;

  const attemptRows = db
    .prepare(
      `SELECT id, created_at, question_type, is_correct, hint_level_used,
              submitted_answer, failure_type, round_step, pass_number
       FROM practice_attempts
       WHERE learner_id = ? AND word_id = ?
       ORDER BY created_at DESC`
    )
    .all(learnerId, wordId) as Array<{
    id: string;
    created_at: string;
    question_type: string | null;
    is_correct: number;
    hint_level_used: number;
    submitted_answer: string | null;
    failure_type: string | null;
    round_step: string | null;
    pass_number: number | null;
  }>;

  const attemptsAsc: AttemptRecord[] = [...attemptRows]
    .reverse()
    .map((row) => ({
      answeredAt: row.created_at,
      isCorrect: row.is_correct === 1,
      hintLevelUsed: row.hint_level_used,
    }));

  const state = stateRow ? mapState(stateRow) : null;
  const realAttempts = attemptRows.length;

  let masteryColour: LearnerWordState["masteryColour"] | null = null;
  let scoreReasons: string[] = [
    "Not started yet — first practice will set the colour.",
  ];
  let scoreLowerBound = 0;
  let scoreEffectiveN = 0;
  let priorityScore = 0;
  let priorityFactors: WordDetailView["priorityFactors"] = [];

  if (state && realAttempts > 0) {
    // Override aggregate counts with the real attempt totals so legacy
    // stub state cannot inflate the picture.
    const liveState: LearnerWordState = {
      ...state,
      attemptCount: realAttempts,
      correctCount: attemptRows.filter((r) => r.is_correct === 1).length,
      wrongCount: attemptRows.filter((r) => r.is_correct === 0).length,
    };
    const breakdown = scoreFromState(liveState, attemptsAsc);
    masteryColour = breakdown.colour ?? "red";
    scoreReasons = breakdown.reasons;
    scoreLowerBound = breakdown.lowerBound;
    scoreEffectiveN = breakdown.effectiveN;

    const word: PracticeWord = {
      id: wordRow.id,
      word: wordRow.word,
      normalizedWord: normalizeWord(wordRow.word),
      difficultyLevel: wordRow.difficulty_level,
      definition: wordRow.definition ?? "",
      example: wordRow.example ?? "",
      examples,
      exampleRefs: getExampleRows(db, wordRow.id),
      synonyms: synonyms.map((s) => s.lemma),
      antonyms: antonyms.map((s) => s.lemma),
      confusables: confusables.map((s) => s.lemma ?? "").filter(Boolean),
      state: liveState,
    };
    const priority = priorityBreakdownForState(
      word,
      attemptsAsc,
      new Date().toISOString()
    );
    priorityScore = priority.score;
    priorityFactors = priority.factors;
  }

  // Live deck rank + projection for the explainability page.
  const allWords = getPracticeWordsForSelection(db, learnerId);
  const allAttempts = loadAttemptHistoryByWord(db, learnerId);
  const nowIso = new Date().toISOString();
  const deck = deckPriorities(allWords, allAttempts, nowIso);
  const rank = rankFor(deck, wordId);
  const selectedNextRoundWordIds = selectedWordIdsForDebug(db, allWords, nowIso, learnerId);
  const isSelectedNextRound = selectedNextRoundWordIds.has(wordId);
  const pickProbabilityNow = isSelectedNextRound ? 1 : 0;

  let projection: DayProjection[] = [];
  if (state) {
    const livePracticeWord = allWords.find((w) => w.id === wordId);
    if (livePracticeWord) {
      projection = projectWord(
        livePracticeWord,
        attemptsAsc,
        allWords,
        allAttempts,
        nowIso,
        14
      );
    }
  }

  const competitors = deck.slice(0, 12).map((row) => ({
    wordId: row.wordId,
    word: row.word,
    score: row.score,
    isThis: row.wordId === wordId,
    inNextRound: selectedNextRoundWordIds.has(row.wordId),
  }));
  for (const selectedWordId of selectedNextRoundWordIds) {
    if (competitors.some((row) => row.wordId === selectedWordId)) continue;
    const selected = deck.find((row) => row.wordId === selectedWordId);
    if (!selected) continue;
    competitors.push({
      wordId: selected.wordId,
      word: selected.word,
      score: selected.score,
      isThis: selected.wordId === wordId,
      inNextRound: true,
    });
  }
  // If this word is outside the displayed queue, append it so the user can see it.
  if (!competitors.some((row) => row.isThis)) {
    const me = deck.find((row) => row.wordId === wordId);
    if (me) {
      competitors.push({
        wordId: me.wordId,
        word: me.word,
        score: me.score,
        isThis: true,
        inNextRound: isSelectedNextRound,
      });
    }
  }

  return {
    id: wordRow.id,
    word: wordRow.word,
    definition: wordRow.definition,
    example: wordRow.example,
    examples,
    synonyms: synonyms.map((s) => s.lemma),
    antonyms: antonyms.map((s) => s.lemma),
    confusables: confusables.map((s) => s.lemma ?? "").filter(Boolean),
    priorityMode: wordRow.priority_mode,
    state,
    masteryColour,
    scoreReasons,
    scoreLowerBound,
    scoreEffectiveN,
    priorityScore,
    priorityFactors,
    attempts: attemptRows.map((row) => ({
      id: row.id,
      answeredAt: row.created_at,
      questionType: (row.question_type as QuestionType | null) ?? null,
      isCorrect: row.is_correct === 1,
      hintLevelUsed: row.hint_level_used,
      submittedAnswer: row.submitted_answer,
      failureType: (row.failure_type as FailureType | null) ?? null,
      roundStep: row.round_step,
      passNumber: row.pass_number,
    })),
    rank: { rank: rank.rank, total: rank.total },
    pickProbabilityNow,
    projection,
    nextBucket: nextBucketTarget(scoreLowerBound),
    competitors,
  };
}

function loadAttemptHistoryByWord(db: DatabaseSync, learnerId = defaultLearnerId()): Map<string, AttemptRecord[]> {
  const rows = db
    .prepare(
      `SELECT word_id, created_at, is_correct, hint_level_used
       FROM practice_attempts
       WHERE learner_id = ?
       ORDER BY created_at ASC`
    )
    .all(learnerId) as Array<{
    word_id: string;
    created_at: string;
    is_correct: number;
    hint_level_used: number;
  }>;
  const byWordId = new Map<string, AttemptRecord[]>();
  for (const row of rows) {
    const list = byWordId.get(row.word_id) ?? [];
    list.push({
      answeredAt: row.created_at,
      isCorrect: row.is_correct === 1,
      hintLevelUsed: row.hint_level_used,
    });
    byWordId.set(row.word_id, list);
  }
  return byWordId;
}

function getPracticeWordsForSelection(db: DatabaseSync, learnerId = defaultLearnerId()): PracticeWord[] {
  const attemptsByWordId = loadAttemptHistoryByWord(db, learnerId);
  return getPracticeWords(learnerId).map((word) => {
    const attempts = attemptsByWordId.get(word.id) ?? null;
    if (!attempts || attempts.length === 0) return word;
    return {
      ...word,
      state: {
        ...word.state,
        masteryColour: masteryColourForState(word.state, attempts)
      }
    };
  });
}

function selectedWordIdsForDebug(
  db: DatabaseSync,
  words: PracticeWord[],
  nowIso: string,
  learnerId = defaultLearnerId()
): Set<string> {
  const activeRound = db
    .prepare(
      `SELECT word_ids_json
       FROM practice_rounds
       WHERE learner_id = ? AND status = 'in_progress'
       ORDER BY started_at DESC, created_at DESC
       LIMIT 1`
    )
    .get(learnerId) as { word_ids_json: string } | undefined;
  if (activeRound) {
    return new Set(JSON.parse(activeRound.word_ids_json) as string[]);
  }

  return new Set(
    selectRoundWordsWithParentPriority(db, words, nowIso, 12, learnerId).wordIds
  );
}

export function createOrUpdateParentWord(input: WordFormInput, learnerId = defaultLearnerId()): string {
  const db = getDb();
  const now = new Date().toISOString();
  const normalized = normalizeWord(input.word);
  if (!normalized) throw new Error("Word is required.");
  const canonicalWord = normalized;
  const wordId = deterministicWordId(normalized);
  const existingWord = db
    .prepare("SELECT id FROM words WHERE normalized_word = ?")
    .get(normalized) as { id: string } | undefined;

  db.prepare(
    `INSERT INTO words (id, word, normalized_word, difficulty_level, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'parent', 'active', ?, ?)
     ON CONFLICT(normalized_word) DO UPDATE SET
       word = excluded.word,
       difficulty_level = excluded.difficulty_level,
       status = 'active',
       content_version = words.content_version + 1,
       updated_at = excluded.updated_at`
  ).run(wordId, canonicalWord, normalized, clampDifficulty(input.difficultyLevel ?? 2), now, now);

  replaceOptionalWordRows(db, wordId, input, now);
  assignVocabularyWordToLearnerInDb(db, learnerId, wordId, now);
  ensureLearnerStateForWord(db, wordId, now, learnerId);
  if (existingWord) {
    resetLearnerStateAfterContentEdit(db, existingWord.id, now, learnerId);
  }
  return wordId;
}

export function updateParentWord(input: WordFormInput & { wordId: string }, learnerId = defaultLearnerId()): string {
  const db = getDb();
  const now = new Date().toISOString();
  const normalized = normalizeWord(input.word);
  if (!normalized) throw new Error("Word is required.");
  const canonicalWord = normalized;

  const existingWord = db
    .prepare("SELECT id FROM words WHERE id = ? AND status = 'active'")
    .get(input.wordId) as { id: string } | undefined;
  if (!existingWord) throw new Error("Vocabulary word not found.");

  const duplicateWord = db
    .prepare("SELECT id FROM words WHERE normalized_word = ? AND id <> ?")
    .get(normalized, input.wordId) as { id: string } | undefined;
  if (duplicateWord) throw new Error(`"${canonicalWord}" is already in the vocabulary list.`);

  db.prepare(
    `UPDATE words
     SET word = ?,
         normalized_word = ?,
         difficulty_level = ?,
         content_version = content_version + 1,
         updated_at = ?
     WHERE id = ?`
  ).run(canonicalWord, normalized, clampDifficulty(input.difficultyLevel ?? 2), now, input.wordId);

  replaceOptionalWordRows(db, input.wordId, input, now);
  assignVocabularyWordToLearnerInDb(db, learnerId, input.wordId, now);
  ensureLearnerStateForWord(db, input.wordId, now, learnerId);
  resetLearnerStateAfterContentEdit(db, input.wordId, now, learnerId);
  return input.wordId;
}

export function findActiveWordByText(word: string): { id: string; word: string } | null {
  const normalized = normalizeWord(word);
  if (!normalized) return null;
  const row = getDb()
    .prepare("SELECT id, word FROM words WHERE normalized_word = ? AND status = 'active' LIMIT 1")
    .get(normalized) as { id: string; word: string } | undefined;
  return row ?? null;
}

export function upsertParentExampleVisualCues(wordId: string, cues: ParentExampleVisualCueInput[]): void {
  if (cues.length === 0) return;
  const db = getDb();
  const now = new Date().toISOString();

  for (const cue of cues) {
    const exampleId = `example_${wordId}_${cue.exampleIndex}`;
    const exampleExists = db.prepare("SELECT id FROM word_examples WHERE id = ?").get(exampleId) as { id: string } | undefined;
    if (!exampleExists) continue;

    db.prepare(
      `INSERT INTO example_visual_cues
        (id, example_id, word_id, provider, model, prompt_version, prompt, image_path, image_url, status, reviewed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'approved', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         provider = excluded.provider,
         model = excluded.model,
         prompt_version = excluded.prompt_version,
         prompt = excluded.prompt,
         image_path = excluded.image_path,
         image_url = NULL,
         status = 'approved',
         reviewed_at = excluded.reviewed_at,
         updated_at = excluded.updated_at`
    ).run(
      `cue_${exampleId}`,
      exampleId,
      wordId,
      cue.provider,
      cue.model,
      cue.promptVersion,
      cue.prompt,
      cue.imagePath.replace(/^\//, "public/"),
      now,
      now,
      now
    );
  }
}

function resetLearnerStateAfterContentEdit(db: DatabaseSync, wordId: string, now: string, learnerId = defaultLearnerId()): void {
  db.prepare(
    `UPDATE learner_word_state
     SET stability_days = 1,
         mastery_colour = 'red',
         last_seen_at = NULL,
         last_correct_at = NULL,
         last_wrong_at = NULL,
         next_review_at = NULL,
         attempt_count = 0,
         correct_count = 0,
         wrong_count = 0,
         last_hint_level_used = NULL,
         average_hint_level_used = 0,
         average_response_time_ms = 0,
         failure_types_json = '[]',
         confused_with_word_ids_json = '[]',
         near_review = 0,
         eligible_questions_since_last_mistake = 0,
         recovery_debt = 0,
         last_practiced_at = NULL,
         last_clean_retrieval_at = NULL,
         last_supported_success_at = NULL,
         last_revealed_at = NULL,
         last_exposed_at = NULL,
         last_practiced_session_id = NULL,
         last_practiced_interaction_index = NULL,
         learner_state_content_version = (SELECT content_version FROM words WHERE id = ?),
         updated_at = ?
     WHERE learner_id = ? AND word_id = ?`
  ).run(wordId, now, learnerId, wordId);
}

export function importWordShells(text: string, learnerId = defaultLearnerId()): number {
  const lines = text
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
  const unique = [...new Set(lines.map(normalizeWord))];
  for (const word of unique) {
    createOrUpdateParentWord({ word, difficultyLevel: 2 }, learnerId);
  }
  return unique.length;
}

function getRemediationWordIds(db: DatabaseSync, learnerId = defaultLearnerId()): {
  revealAndMoveOnWordIds: string[];
  eventuallyCorrectNotFirstAttemptWordIds: string[];
} {
  const revealRows = db
    .prepare(
      `SELECT word_id
       FROM practice_attempts
       WHERE learner_id = ? AND reveal_and_move_on = 1
       GROUP BY word_id
       ORDER BY MAX(created_at) DESC`
    )
    .all(learnerId) as Array<{ word_id: string }>;

  const recoveredRows = db
    .prepare(
      `SELECT a.word_id
       FROM practice_attempts a
       JOIN learner_word_state s
         ON s.learner_id = a.learner_id
        AND s.word_id = a.word_id
       WHERE a.learner_id = ?
         AND a.eventually_correct = 1
         AND a.first_attempt_correct = 0
         AND a.reveal_and_move_on = 0
         AND s.near_review = 1
         AND s.eligible_questions_since_last_mistake < ?
       GROUP BY a.word_id
       ORDER BY MAX(a.created_at) DESC`
    )
    .all(learnerId, DEFAULT_NEAR_REVIEW_SPACING) as Array<{ word_id: string }>;

  return {
    revealAndMoveOnWordIds: revealRows.map((row) => row.word_id),
    eventuallyCorrectNotFirstAttemptWordIds: recoveredRows.map((row) => row.word_id)
  };
}

function getRoundRowForSession(db: DatabaseSync, sessionId: string): PracticeRoundRow | null {
  const row = db.prepare("SELECT * FROM practice_rounds WHERE session_id = ? ORDER BY started_at DESC LIMIT 1").get(sessionId) as
    | PracticeRoundRow
    | undefined;
  return row ?? null;
}

function getRoundSessionView(
  db: DatabaseSync,
  session: SessionRow,
  round: PracticeRoundRow,
  selectedCardId: string | undefined,
  visualCuePreferences: VisualCuePreferences
): SessionView {
  const wordIds = readRoundWordIds(round);
  const cardViewCounts = readCardViewCounts(round);
  const words = getCommittedPracticeWords(db, session.learner_id, wordIds);
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const roundWords = wordIds.map((wordId) => {
    const word = wordMap.get(wordId);
    if (!word) throw new Error(`Round word ${wordId} is not available.`);
    return word;
  });
  const roundSummary = readRoundSummary(round);
  const selectionReasons = new Map((roundSummary.round?.selectionReasons ?? []).map((reason) => [reason.wordId, reason]));
  const attempts = getRoundStepAttempts(db, round.id);
  const attemptCount = getSessionAttemptCount(db, session.id);
  const cards = roundWords.map((word) =>
    toRoundLearnCardView(db, word, cardViewCounts[word.id] ?? 0, selectionReasons.get(word.id) ?? null, visualCuePreferences)
  );
  const selectedCard =
    (selectedCardId ? cards.find((card) => card.id === selectedCardId) : null) ??
    cards.find((card) => card.viewCount < 2) ??
    cards[0] ??
    null;
  const canUnlockMeaning = canUnlockMeaningStep(cardViewCounts, wordIds);

  let question: PracticeQuestion | null = null;
  let word: PracticeWord | null = null;
  let passNumber: number | null = null;
  let currentPassWordIds: string[] = [];
  let attemptNumberForWordInStep: number | null = null;
  let isRetryPass = false;
  let remainingInPass = 0;
  let stepProgressLabel = stepLabel(round.current_step);

  if (round.status === "in_progress" && isScoredRoundStep(round.current_step)) {
    const cursor = nextRoundStepQuestion(wordIds, round.current_step, attempts, round.max_retry_passes);
    if (cursor) {
      word = wordMap.get(cursor.wordId) ?? null;
      if (!word) throw new Error(`Round word ${cursor.wordId} is not available.`);
      const questionType: QuestionType = cursor.step === "meaning_recognition" ? "definition_choice" : "fill_sentence";
      question = generateQuestion(questionType, word, words, { preferredDistractorWordIds: wordIds });
      passNumber = cursor.passNumber;
      currentPassWordIds = cursor.pendingWordIds;
      attemptNumberForWordInStep = cursor.attemptNumberForWordInStep;
      isRetryPass = cursor.isRetryPass;
      remainingInPass = cursor.remainingInPass;
      stepProgressLabel = `${stepLabel(cursor.step)} · pass ${cursor.passNumber}`;
    }
  }

  return {
    mode: "round_mission",
    sessionId: session.id,
    status: session.status,
    questionNumber: attemptCount + 1,
    totalQuestions: Math.max(session.target_question_count, attemptCount + remainingInPass),
    question,
    word,
    visualCuesEnabled: visualCuePreferences.enabled,
    visualCuePreferences,
    visualCue:
      question && word && shouldShowVisualCueForRoundStep(round.current_step, visualCuePreferences)
        ? getVisualCueForQuestion(db, question, word.word)
        : null,
    round: {
      roundId: round.id,
      status: round.status,
      currentStep: round.current_step,
      wordCount: wordIds.length,
      cardViewCounts,
      cards,
      selectedCard,
      canUnlockMeaning,
      question,
      word,
      passNumber,
      currentPassWordIds,
      attemptNumberForWordInStep,
      isRetryPass,
      remainingInPass,
      stepProgressLabel
    }
  };
}

function submitRoundAnswer(
  db: DatabaseSync,
  session: SessionRow,
  round: PracticeRoundRow,
  input: {
    sessionId: string;
    submittedAnswer: string;
    hintLevelUsed: number;
    responseTimeMs: number;
  }
): SubmitSessionAnswerResult {
  if (session.status !== "in_progress" || round.status !== "in_progress") {
    return { completed: true, attemptId: null, isCorrect: null, questionType: null, roundStep: null, passNumber: null };
  }
  if (!isScoredRoundStep(round.current_step)) {
    throw new Error("This round is not ready for scored answers yet.");
  }

  const wordIds = readRoundWordIds(round);
  const attempts = getRoundStepAttempts(db, round.id);
  const cursor = nextRoundStepQuestion(wordIds, round.current_step, attempts, round.max_retry_passes);
  if (!cursor) {
    advanceRoundAfterStepIfReady(db, session.id, round);
    return { completed: false, attemptId: null, isCorrect: null, questionType: null, roundStep: null, passNumber: null };
  }

  const words = getCommittedPracticeWords(db, session.learner_id, wordIds);
  const word = words.find((candidate) => candidate.id === cursor.wordId);
  if (!word) throw new Error(`Round word ${cursor.wordId} is not available.`);

  const questionType: QuestionType = cursor.step === "meaning_recognition" ? "definition_choice" : "fill_sentence";
  const question = generateQuestion(questionType, word, words, { preferredDistractorWordIds: wordIds });
  const assessment = assessAnswer(question, input.submittedAnswer);
  const now = new Date().toISOString();
  const revealAndMoveOn = !assessment.isCorrect && cursor.passNumber >= round.max_retry_passes;
  const firstAttemptCorrect = cursor.attemptNumberForWordInStep === 1 ? assessment.isCorrect : false;
  const outcome: PracticeAttemptOutcome = {
    questionType,
    isCorrect: assessment.isCorrect,
    hintLevelUsed: input.hintLevelUsed,
    maxHintLevelAvailable: question.hints.length,
    responseTimeMs: input.responseTimeMs,
    failureType: assessment.failureType,
    answeredAt: now,
    masteryCredit: cursor.attemptNumberForWordInStep === 1 ? "normal" : "recovery"
  };

  const attemptId = randomUUID();
  db.prepare(
    `INSERT INTO practice_attempts
      (id, session_id, learner_id, word_id, question_type, prompt_json, expected_answer_json,
       submitted_answer, is_correct, hint_level_used, max_hint_level_available, response_time_ms, failure_type,
       round_id, round_step, pass_number, attempt_number_for_word_in_step,
       first_attempt_correct, eventually_correct, reveal_and_move_on, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    session.id,
    session.learner_id,
    word.id,
    questionType,
    JSON.stringify({
      prompt: question.prompt,
      instruction: question.instruction,
      choices: question.choices,
      hints: question.hints,
      targetWord: question.targetWord,
      selectedExampleId: question.selectedExampleId
    }),
    JSON.stringify({ expectedAnswers: question.expectedAnswers, canonicalAnswer: question.canonicalAnswer }),
    input.submittedAnswer,
    assessment.isCorrect ? 1 : 0,
    input.hintLevelUsed,
    question.hints.length,
    input.responseTimeMs,
    assessment.failureType,
    round.id,
    cursor.step,
    cursor.passNumber,
    cursor.attemptNumberForWordInStep,
    firstAttemptCorrect ? 1 : 0,
    assessment.isCorrect ? 1 : 0,
    revealAndMoveOn ? 1 : 0,
    now
  );

  saveLearnerWordState(
    db,
    applyPracticeEventToSelectionState(updateStateAfterAttempt(word.state, outcome), word.state, {
      answeredAt: now,
      isCorrect: assessment.isCorrect,
      hintLevelUsed: input.hintLevelUsed,
      revealAndMoveOn,
      firstAttemptCorrect,
      sessionId: session.id,
      interactionIndex: getSessionAttemptCount(db, session.id)
    })
  );
  db.prepare("UPDATE practice_sessions SET actual_question_count = actual_question_count + 1, updated_at = ? WHERE id = ?").run(
    now,
    session.id
  );

  const refreshedRound = getRoundRowForSession(db, session.id);
  if (!refreshedRound) throw new Error(`Round missing for session ${session.id}`);
  const completed = advanceRoundAfterStepIfReady(db, session.id, refreshedRound);

  return { completed, attemptId, isCorrect: assessment.isCorrect, questionType, roundStep: cursor.step, passNumber: cursor.passNumber };
}

function advanceRoundAfterStepIfReady(db: DatabaseSync, sessionId: string, round: PracticeRoundRow): boolean {
  if (!isScoredRoundStep(round.current_step)) return false;

  const wordIds = readRoundWordIds(round);
  const attempts = getRoundStepAttempts(db, round.id);
  const progress = evaluateRoundStepProgress(wordIds, round.current_step, attempts, round.max_retry_passes);
  if (!progress.canAdvanceStep) return false;

  const now = new Date().toISOString();
  if (round.current_step === "meaning_recognition") {
    db.prepare("UPDATE practice_rounds SET current_step = 'context_usage', updated_at = ? WHERE id = ?").run(now, round.id);
    return false;
  }

  const summary = buildCompletedRoundSummary(db, round, now);
  db.prepare(
    `UPDATE practice_rounds
     SET status = 'completed', ended_at = ?, summary_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(now, JSON.stringify(summary), now, round.id);

  db.prepare(
    `UPDATE practice_sessions
     SET status = 'completed', ended_at = ?, summary_json = ?, updated_at = ?
     WHERE id = ?`
  ).run(now, JSON.stringify(summary), now, sessionId);

  return true;
}

function buildCompletedRoundSummary(db: DatabaseSync, round: PracticeRoundRow, completedAt: string): SessionSummary {
  const wordIds = readRoundWordIds(round);
  const startedSummary = readRoundSummary(round);
  const attempts = getRoundStepAttempts(db, round.id);
  const meaningProgress = evaluateRoundStepProgress(wordIds, "meaning_recognition", attempts, round.max_retry_passes);
  const contextProgress = evaluateRoundStepProgress(wordIds, "context_usage", attempts, round.max_retry_passes);
  const meaningByWord = new Map(meaningProgress.statuses.map((status) => [status.wordId, status]));
  const contextByWord = new Map(contextProgress.statuses.map((status) => [status.wordId, status]));
  const nowPlusNearReview = new Date(new Date(completedAt).getTime() + 12 * 3_600_000).toISOString();

  const words = getCommittedPracticeWords(db, round.learner_id, wordIds);
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const wordName = (wordId: string) => wordMap.get(wordId)?.word ?? wordId;
  const hasMistake = (wordId: string) => {
    const meaning = meaningByWord.get(wordId);
    const context = contextByWord.get(wordId);
    return Boolean((meaning?.mistakeCount ?? 0) > 0 || (context?.mistakeCount ?? 0) > 0);
  };

  const firstAttemptSecureWordIds = wordIds.filter(
    (wordId) => meaningByWord.get(wordId)?.firstAttemptCorrect === true && contextByWord.get(wordId)?.firstAttemptCorrect === true
  );
  const revealAndMoveOnWordIds = wordIds.filter(
    (wordId) => meaningByWord.get(wordId)?.shouldRevealAndMoveOn || contextByWord.get(wordId)?.shouldRevealAndMoveOn
  );
  const eventuallyCorrectWordIds = wordIds.filter((wordId) => {
    if (revealAndMoveOnWordIds.includes(wordId)) return false;
    const meaning = meaningByWord.get(wordId);
    const context = contextByWord.get(wordId);
    return Boolean(
      (meaning?.eventuallyCorrect && meaning.firstAttemptCorrect === false) ||
        (context?.eventuallyCorrect && context.firstAttemptCorrect === false)
    );
  });
  const mistakeWordIds = wordIds.filter((wordId) => hasMistake(wordId));
  updateNearReviewAfterRound(db, wordIds, mistakeWordIds, completedAt, nowPlusNearReview, round.learner_id);

  const refreshedWords = getCommittedPracticeWords(db, round.learner_id, wordIds);
  const refreshedWordMap = new Map(refreshedWords.map((word) => [word.id, word]));
  const nearReviewWordIds = wordIds.filter((wordId) => refreshedWordMap.get(wordId)?.state.nearReview);
  const nearReviewWords = nearReviewWordIds.map(wordName);
  const eventuallyCorrectWords = eventuallyCorrectWordIds.map(wordName);
  const revealAndMoveOnWords = revealAndMoveOnWordIds.map(wordName);
  const firstAttemptSecureWords = firstAttemptSecureWordIds.map(wordName);
  const mistakeEvidence = wordIds
    .map((wordId) => {
      const meaningMistakes = meaningByWord.get(wordId)?.mistakeCount ?? 0;
      const contextMistakes = contextByWord.get(wordId)?.mistakeCount ?? 0;
      return {
        word: wordName(wordId),
        meaningMistakes,
        contextMistakes,
        totalMistakes: meaningMistakes + contextMistakes
      };
    })
    .filter((item) => item.totalMistakes > 0);

  const explanation =
    eventuallyCorrectWords.length > 0 || revealAndMoveOnWords.length > 0
      ? `Defne completed the cautious round, but it is still Building because ${eventuallyCorrectWords.length + revealAndMoveOnWords.length} word${eventuallyCorrectWords.length + revealAndMoveOnWords.length === 1 ? "" : "s"} needed recovery rather than first-attempt recall.`
      : "Defne completed this round with first-attempt meaning and context recall.";

  return {
    plan: wordIds.flatMap((wordId) => [
      { wordId, questionType: "definition_choice" },
      { wordId, questionType: "fill_sentence" }
    ]),
    wordsImproved: unique([...firstAttemptSecureWords, ...eventuallyCorrectWords]).slice(0, 8),
    revisitTomorrow: unique([...nearReviewWords, ...revealAndMoveOnWords]).slice(0, 8),
    round: {
      roundId: round.id,
      firstAttemptSecureWords,
      eventuallyCorrectWords,
      revealAndMoveOnWords,
      nearReviewWords,
      selectionReasons: startedSummary.round?.selectionReasons ?? [],
      mistakeEvidence,
      explanation
    },
    completedAt
  };
}

function updateNearReviewAfterRound(
  db: DatabaseSync,
  wordIds: string[],
  mistakeWordIds: string[],
  now: string,
  nextReviewAt: string,
  learnerId = defaultLearnerId()
): void {
  const mistakeSet = new Set(mistakeWordIds);
  for (const wordId of wordIds) {
    if (mistakeSet.has(wordId)) {
      db.prepare(
        `UPDATE learner_word_state
         SET near_review = 1,
             eligible_questions_since_last_mistake = 0,
             next_review_at = ?,
             updated_at = ?
         WHERE learner_id = ? AND word_id = ?`
      ).run(nextReviewAt, now, learnerId, wordId);
      continue;
    }

    const row = db
      .prepare(
        `SELECT near_review, eligible_questions_since_last_mistake
         FROM learner_word_state
         WHERE learner_id = ? AND word_id = ?`
      )
      .get(learnerId, wordId) as
      | { near_review: number; eligible_questions_since_last_mistake: number }
      | undefined;

    if (!row || row.near_review !== 1) continue;

    const eligibleQuestions = row.eligible_questions_since_last_mistake + 2;
    const keepNearReview = shouldKeepNearReview(1, eligibleQuestions);
    db.prepare(
      `UPDATE learner_word_state
       SET near_review = ?,
           eligible_questions_since_last_mistake = ?,
           updated_at = ?
       WHERE learner_id = ? AND word_id = ?`
    ).run(keepNearReview ? 1 : 0, eligibleQuestions, now, learnerId, wordId);
  }
}

function getRoundStepAttempts(db: DatabaseSync, roundId: string): RoundStepAttempt[] {
  const rows = db
    .prepare(
      `SELECT word_id, round_step, pass_number, is_correct
       FROM practice_attempts
       WHERE round_id = ? AND round_step IN ('meaning_recognition', 'context_usage')
       ORDER BY created_at ASC, id ASC`
    )
    .all(roundId) as unknown as Array<{
    word_id: string;
    round_step: RoundStep;
    pass_number: number | null;
    is_correct: number;
  }>;

  return rows.map((row) => ({
    wordId: row.word_id,
    step: row.round_step,
    passNumber: row.pass_number ?? 1,
    isCorrect: row.is_correct === 1
  }));
}

function toRoundLearnCardView(
  db: DatabaseSync,
  word: PracticeWord,
  viewCount: number,
  selectionReason: RoundSelectionReason | null,
  visualCuePreferences: VisualCuePreferences
): RoundLearnCardView {
  const selectedExample = selectLearnCardExample(word, viewCount);
  const cardWord = { ...word, example: selectedExample.sentence };
  return {
    id: word.id,
    word: word.word,
    definition: word.definition,
    example: selectedExample.sentence,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    confusables: word.confusables,
    viewCount,
    visualCue:
      visualCuePreferences.enabled && visualCuePreferences.learnCards
        ? getVisualCueForExample(db, selectedExample.id, word.word)
        : null,
    supportMode: learnCardSupportMode(viewCount),
    activeRecallPrompt: activeRecallPrompt(cardWord),
    selectionReason,
    history: {
      attemptCount: word.state.attemptCount,
      correctCount: word.state.correctCount,
      wrongCount: word.state.wrongCount,
      masteryColour:
        word.state.attemptCount === 0 ? null : masteryColourForState(word.state)
    }
  };
}

function selectLearnCardExample(word: PracticeWord, viewCount: number): { id: string | null; sentence: string } {
  const refs =
    word.exampleRefs && word.exampleRefs.length > 0
      ? word.exampleRefs
      : (word.examples.length > 0 ? word.examples : [word.example]).map((sentence) => ({
          id: null,
          sentence
        }));
  const examples = refs
    .map((example) => ({
      id: example.id,
      sentence: example.sentence.trim()
    }))
    .filter((example) => Boolean(example.sentence));
  if (examples.length === 0) return { id: null, sentence: word.example };
  const index = Math.min(Math.max(0, viewCount), examples.length - 1);
  return examples[index];
}

function activeRecallPrompt(word: PracticeWord): string {
  const escaped = word.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}(?:s|ed|ing)?\\b`, "i");
  if (pattern.test(word.example)) {
    return word.example.replace(pattern, "_____");
  }
  return "Before revealing the support, say what this word means and imagine a sentence where it fits.";
}

function readRoundWordIds(round: PracticeRoundRow): string[] {
  return JSON.parse(round.word_ids_json) as string[];
}

function readCardViewCounts(round: PracticeRoundRow): Record<string, number> {
  return JSON.parse(round.card_view_counts_json) as Record<string, number>;
}

function readRoundSummary(round: PracticeRoundRow): SessionSummary {
  return JSON.parse(round.summary_json) as SessionSummary;
}

function isScoredRoundStep(step: RoundLearningStep): step is RoundStep {
  return step === "meaning_recognition" || step === "context_usage";
}

function stepLabel(step: RoundLearningStep): string {
  if (step === "learn_cards") return "Learn cards";
  if (step === "meaning_recognition") return "Meaning recognition";
  return "Context usage";
}

function getPracticeWords(learnerId = defaultLearnerId()): PracticeWord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.normalized_word, w.difficulty_level, d.definition
       FROM words w
       JOIN learner_vocabulary_words lvw ON lvw.word_id = w.id AND lvw.learner_id = ? AND lvw.status = 'active'
       JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       WHERE w.status = 'active'
         AND EXISTS (SELECT 1 FROM word_examples e WHERE e.word_id = w.id AND e.status = 'approved')
       ORDER BY w.word ASC`
    )
    .all(learnerId) as unknown as WordRow[];

  return rows.map((row) => {
    return practiceWordFromRow(db, learnerId, row);
  });
}

function getCommittedPracticeWords(db: DatabaseSync, learnerId: string, wordIds: string[]): PracticeWord[] {
  const uniqueWordIds = Array.from(new Set(wordIds));
  if (uniqueWordIds.length === 0) return [];
  const placeholders = uniqueWordIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.normalized_word, w.difficulty_level, d.definition
       FROM words w
       JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
       WHERE w.id IN (${placeholders})
         AND w.status = 'active'
         AND EXISTS (SELECT 1 FROM word_examples e WHERE e.word_id = w.id AND e.status = 'approved')
       ORDER BY w.word ASC`
    )
    .all(...uniqueWordIds) as unknown as WordRow[];

  return rows.map((row) => practiceWordFromRow(db, learnerId, row));
}

function practiceWordFromRow(db: DatabaseSync, learnerId: string, row: WordRow): PracticeWord {
    const state = getStateForWord(db, row.id, learnerId);
    const exampleRefs = getExampleRows(db, row.id);
    const examples = exampleRefs.map((example) => example.sentence);
    return {
      id: row.id,
      word: row.word,
      normalizedWord: row.normalized_word,
      difficultyLevel: row.difficulty_level,
      definition: row.definition ?? "",
      example: examples[0] ?? "",
      examples,
      exampleRefs,
      synonyms: getTextList(db, "word_synonyms", "synonym", row.id),
      antonyms: getTextList(db, "word_antonyms", "antonym", row.id),
      confusables: getTextList(db, "word_confusables", "confusable_text", row.id),
      state
    };
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

  if (input.example !== undefined || input.examples !== undefined) {
    db.prepare("DELETE FROM word_examples WHERE word_id = ?").run(wordId);
    const examples = uniqueTexts(input.examples ?? [input.example ?? ""]);
    for (const [index, example] of examples.entries()) {
      db.prepare(
        `INSERT INTO word_examples
          (id, word_id, sentence, source, status, created_at, updated_at)
         VALUES (?, ?, ?, 'parent', 'approved', ?, ?)`
      ).run(`example_${wordId}_${index}`, wordId, example, now, now);
    }
  }

  replaceListValues(db, "word_synonyms", "synonym", wordId, input.synonyms ?? [input.synonym ?? ""], now);
  replaceListValues(db, "word_antonyms", "antonym", wordId, input.antonyms ?? [input.antonym ?? ""], now);

  if (input.confusable !== undefined || input.confusables !== undefined) {
    db.prepare("DELETE FROM word_confusables WHERE word_id = ?").run(wordId);
    for (const [index, confusable] of uniqueTexts(input.confusables ?? [input.confusable ?? ""]).entries()) {
      db.prepare(
        `INSERT INTO word_confusables
          (id, word_id, confusable_text, explanation, created_at, updated_at)
         VALUES (?, ?, ?, NULL, ?, ?)`
      ).run(`confusable_${wordId}_${index}`, wordId, confusable, now, now);
    }
  }

}

function replaceListValues(
  db: DatabaseSync,
  table: "word_synonyms" | "word_antonyms",
  column: "synonym" | "antonym",
  wordId: string,
  values: string[],
  now: string
): void {
  db.prepare(`DELETE FROM ${table} WHERE word_id = ?`).run(wordId);
  for (const [index, value] of uniqueTexts(values).entries()) {
    db.prepare(`INSERT INTO ${table} (id, word_id, ${column}, created_at) VALUES (?, ?, ?, ?)`).run(
      `${column}_${wordId}_${index}`,
      wordId,
      value,
      now
    );
  }
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
      `SELECT w.word, a.is_correct
       FROM practice_attempts a
       JOIN words w ON w.id = a.word_id
       WHERE a.session_id = ?
       ORDER BY a.created_at ASC`
    )
    .all(sessionId) as unknown as Array<{ word: string; is_correct: number }>;

  return {
    plan,
    wordsImproved: unique(rows.filter((row) => row.is_correct === 1).map((row) => row.word)).slice(0, 8),
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

function getStateForWord(db: DatabaseSync, wordId: string, learnerId = defaultLearnerId()): LearnerWordState {
  ensureLearnerStateForWord(db, wordId, new Date().toISOString(), learnerId);
  const row = db
    .prepare("SELECT * FROM learner_word_state WHERE learner_id = ? AND word_id = ?")
    .get(learnerId, wordId) as unknown as StateRow;
  return mapState(row);
}

function saveLearnerWordState(db: DatabaseSync, state: LearnerWordState): void {
  db.prepare(
    `UPDATE learner_word_state SET
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

function ensureLearnerStateForWord(db: DatabaseSync, wordId: string, now: string, learnerId = defaultLearnerId()): void {
  db.prepare(
    `INSERT OR IGNORE INTO learner_word_state
      (id, learner_id, word_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(`state_${learnerId}_${wordId}`, learnerId, wordId, now, now);
}

function mapState(row: StateRow): LearnerWordState {
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

function getTextList(db: DatabaseSync, table: string, column: string, wordId: string): string[] {
  const rows = db.prepare(`SELECT ${column} AS value FROM ${table} WHERE word_id = ?`).all(wordId) as unknown as Array<{
    value: string | null;
  }>;
  return rows.map((row) => row.value).filter((value): value is string => Boolean(value));
}

function getExamples(db: DatabaseSync, wordId: string): string[] {
  return getExampleRows(db, wordId).map((row) => row.sentence);
}

function getExampleRows(db: DatabaseSync, wordId: string): Array<{ id: string; sentence: string }> {
  const rows = db
    .prepare(
      `SELECT id, sentence
       FROM word_examples
       WHERE word_id = ? AND status = 'approved'
       ORDER BY id ASC`
    )
    .all(wordId) as Array<{ id: string; sentence: string }>;
  return rows.filter((row) => Boolean(row.sentence));
}

function getVisualCuePreferenceFromDb(db: DatabaseSync, learnerId = defaultLearnerId()): VisualCuePreferences {
  const row = db
    .prepare(
      `SELECT visual_cues_enabled,
              visual_cues_on_learn_cards,
              visual_cues_on_meaning_questions,
              visual_cues_on_context_questions
       FROM learner_profiles
       WHERE learner_id = ?`
    )
    .get(learnerId) as
    | {
        visual_cues_enabled: number;
        visual_cues_on_learn_cards: number;
        visual_cues_on_meaning_questions: number;
        visual_cues_on_context_questions: number;
      }
    | undefined;
  const enabled = row ? row.visual_cues_enabled !== 0 : true;
  return {
    enabled,
    learnCards: enabled && (row ? row.visual_cues_on_learn_cards === 1 : true),
    meaningQuestions: enabled && (row ? row.visual_cues_on_meaning_questions === 1 : false),
    contextQuestions: enabled && (row ? row.visual_cues_on_context_questions === 1 : false)
  };
}

function getVisualCueGenerationPreferenceFromDb(db: DatabaseSync, learnerId = defaultLearnerId()): boolean {
  const row = db
    .prepare(
      `SELECT visual_cue_generation_enabled
       FROM learner_profiles
       WHERE learner_id = ?`
    )
    .get(learnerId) as { visual_cue_generation_enabled: number } | undefined;
  return row ? row.visual_cue_generation_enabled === 1 : false;
}

function getNextRoundMixPreferenceFromDb(db: DatabaseSync, learnerId = defaultLearnerId()): NextRoundMixPreference {
  const row = db
    .prepare(
      `SELECT next_round_new_count,
              next_round_recovery_count,
              next_round_review_count,
              next_round_stable_count
       FROM learner_profiles
       WHERE learner_id = ?`
    )
    .get(learnerId) as
    | {
        next_round_new_count: number;
        next_round_recovery_count: number;
        next_round_review_count: number;
        next_round_stable_count: number;
      }
    | undefined;
  return normalizeNextRoundMix(
    row
      ? {
          new: row.next_round_new_count,
          recovery: row.next_round_recovery_count,
          review: row.next_round_review_count,
          stable: row.next_round_stable_count
        }
      : DEFAULT_NEXT_ROUND_MIX
  );
}

function normalizeNextRoundMix(preference: Partial<NextRoundMixPreference>): NextRoundMixPreference {
  const count = (value: number | undefined, fallback: number) => {
    const rounded = Math.round(value ?? fallback);
    return Number.isFinite(rounded) ? Math.max(0, Math.min(12, rounded)) : fallback;
  };
  const values = {
    new: count(preference.new, DEFAULT_NEXT_ROUND_MIX.new),
    recovery: count(preference.recovery, DEFAULT_NEXT_ROUND_MIX.recovery),
    review: count(preference.review, DEFAULT_NEXT_ROUND_MIX.review),
    stable: count(preference.stable, DEFAULT_NEXT_ROUND_MIX.stable)
  };
  const total = values.new + values.recovery + values.review + values.stable;
  if (total <= 12) return values;

  let overflow = total - 12;
  for (const bucket of ["stable", "review", "recovery", "new"] as const) {
    const reduction = Math.min(values[bucket], overflow);
    values[bucket] -= reduction;
    overflow -= reduction;
    if (overflow === 0) break;
  }
  return values;
}

function getVisualCueForQuestion(db: DatabaseSync, question: PracticeQuestion, word: string): VisualCue | null {
  return getVisualCueForExample(db, question.selectedExampleId, word);
}

function shouldShowVisualCueForRoundStep(step: RoundLearningStep, preferences: VisualCuePreferences): boolean {
  if (!preferences.enabled) return false;
  if (step === "meaning_recognition") return preferences.meaningQuestions;
  if (step === "context_usage") return preferences.contextQuestions;
  return false;
}

function shouldShowVisualCueForAttempt(
  questionType: QuestionType,
  roundStep: RoundLearningStep | null,
  preferences: VisualCuePreferences
): boolean {
  if (roundStep) return shouldShowVisualCueForRoundStep(roundStep, preferences);
  return shouldShowVisualCueForQuestionType(questionType, preferences);
}

function shouldShowVisualCueForQuestion(question: PracticeQuestion, preferences: VisualCuePreferences): boolean {
  return shouldShowVisualCueForQuestionType(question.questionType, preferences);
}

function shouldShowVisualCueForQuestionType(questionType: QuestionType, preferences: VisualCuePreferences): boolean {
  if (!preferences.enabled) return false;
  if (questionType === "definition_choice" || questionType === "synonym_choice" || questionType === "antonym_choice") {
    return preferences.meaningQuestions;
  }
  if (questionType === "fill_sentence" || questionType === "sentence_usage_choice") {
    return preferences.contextQuestions;
  }
  return false;
}

function getVisualCueForExample(db: DatabaseSync, exampleId: string | null, word: string): VisualCue | null {
  if (!exampleId) return null;
  const row = db
    .prepare(
      `SELECT image_path, image_url
       FROM example_visual_cues
       WHERE example_id = ?
         AND status = 'approved'
         AND (image_path IS NOT NULL OR image_url IS NOT NULL)
       ORDER BY reviewed_at DESC, created_at DESC, id ASC
       LIMIT 1`
    )
    .get(exampleId) as { image_path: string | null; image_url: string | null } | undefined;
  const rawSrc = row?.image_path ?? row?.image_url ?? null;
  if (!rawSrc) return null;
  return {
    src: normaliseCueSrc(rawSrc),
    alt: `Visual cue for ${word}`,
    exampleId
  };
}

function normaliseCueSrc(src: string): string {
  if (src.startsWith("/") || src.startsWith("http://") || src.startsWith("https://")) return src;
  return `/${src.replace(/^public\//, "")}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function clampDifficulty(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}
