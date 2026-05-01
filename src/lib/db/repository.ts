import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { assessAnswer, generateQuestion, type PracticeQuestion } from "../learning/questions";
import { masteryColourForState, selectSessionPlan, updateStateAfterAttempt } from "../learning/mastery";
import { selectRoundWords } from "../learning/roundSelection";
import {
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
  near_review: number;
  eligible_questions_since_last_mistake: number;
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
    masteryColour: LearnerWordState["masteryColour"];
    selectionReason: RoundSelectionReason;
    weakestDimension: string;
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
  spellingNote: string | null;
  viewCount: number;
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
  submittedAnswer: string;
  canonicalAnswer: string;
  isCorrect: boolean;
  failureType: FailureType;
  hintLevelUsed: number;
  hints: string[];
  spellingNote: string | null;
  roundStep: RoundLearningStep | null;
  passNumber: number | null;
  attemptNumberForWordInStep: number | null;
  firstAttemptCorrect: boolean | null;
  eventuallyCorrect: boolean | null;
  revealAndMoveOn: boolean;
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
  latestRound: SessionSummary["round"] | null;
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

export function getMissionPreview(targetQuestionCount = 8): MissionPreview {
  const db = getDb();
  const words = getPracticeWords();
  const selection = selectRoundWords(words, new Date().toISOString(), targetQuestionCount, getRemediationWordIds(db));
  const byId = new Map(words.map((word) => [word.id, word]));
  const reasonByWordId = new Map(selection.reasons.map((reason) => [reason.wordId, reason]));

  return {
    targetQuestionCount: selection.wordIds.length,
    words: selection.wordIds.map((wordId) => {
      const word = byId.get(wordId);
      const selectionReason = reasonByWordId.get(wordId);
      if (!word) throw new Error(`Missing planned word ${wordId}`);
      if (!selectionReason) throw new Error(`Missing round selection reason for ${wordId}`);
      return {
        id: word.id,
        word: word.word,
        definition: word.definition,
        masteryColour: word.state.masteryColour,
        selectionReason,
        weakestDimension: weakestDimensionLabel(word.state)
      };
    })
  };
}

export function startRoundMission(roundWordCount = 8): string {
  const db = getDb();
  const words = getPracticeWords();
  const now = new Date().toISOString();
  const selection = selectRoundWords(words, now, roundWordCount, getRemediationWordIds(db));
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
      spellingStillWeakWords: [],
      selectionReasons: selection.reasons,
      mistakeEvidence: [],
      explanation: "Round started. The word list is selected from recent mistakes, due reviews, and building words."
    }
  };

  db.prepare(
    `INSERT INTO practice_sessions
      (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, summary_json, created_at, updated_at)
     VALUES (?, ?, 'daily_mission', 'in_progress', ?, 0, ?, ?, ?, ?)`
  ).run(sessionId, defaultLearnerId(), plan.length, now, JSON.stringify(summary), now, now);

  db.prepare(
    `INSERT INTO practice_rounds
      (id, session_id, learner_id, status, current_step, max_retry_passes, word_ids_json,
       card_view_counts_json, started_at, summary_json, created_at, updated_at)
     VALUES (?, ?, ?, 'in_progress', 'learn_cards', ?, ?, '{}', ?, ?, ?, ?)`
  ).run(
    roundId,
    sessionId,
    defaultLearnerId(),
    DEFAULT_ROUND_MAX_RETRY_PASSES,
    JSON.stringify(wordIds),
    now,
    JSON.stringify(summary),
    now,
    now
  );

  return sessionId;
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

export function getSessionView(sessionId: string, selectedCardId?: string): SessionView {
  const db = getDb();
  const session = getSessionRow(db, sessionId);
  const round = getRoundRowForSession(db, sessionId);
  if (round) {
    return getRoundSessionView(db, session, round, selectedCardId);
  }

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
      word: null,
      mode: "daily_mission",
      round: null
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
    word,
    mode: "daily_mission",
    round: null
  };
}

export function submitSessionAnswer(input: {
  sessionId: string;
  submittedAnswer: string;
  hintLevelUsed: number;
  responseTimeMs: number;
}): { completed: boolean; attemptId: string | null } {
  const db = getDb();
  const session = getSessionRow(db, input.sessionId);
  const round = getRoundRowForSession(db, input.sessionId);
  if (round) return submitRoundAnswer(db, session, round, input);

  if (session.status !== "in_progress") return { completed: true, attemptId: null };

  const plan = readSessionPlan(session);
  const attemptIndex = getSessionAttemptCount(db, input.sessionId);
  const current = plan[attemptIndex];
  if (!current) {
    completeSession(db, session.id);
    return { completed: true, attemptId: null };
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

  const attemptId = randomUUID();
  db.prepare(
    `INSERT INTO practice_attempts
      (id, session_id, learner_id, word_id, question_type, prompt_json, expected_answer_json,
       submitted_answer, is_correct, hint_level_used, max_hint_level_available, response_time_ms, failure_type, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    attemptId,
    session.id,
    defaultLearnerId(),
    word.id,
    current.questionType,
    JSON.stringify({
      prompt: question.prompt,
      instruction: question.instruction,
      choices: question.choices,
      hints: question.hints,
      targetWord: question.targetWord
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

  return { completed, attemptId };
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
  const plan = readSessionPlan(session);
  const row = db
    .prepare(
      `SELECT a.id, a.session_id, a.word_id, a.question_type, a.prompt_json, a.expected_answer_json,
              a.submitted_answer, a.is_correct, a.hint_level_used, a.failure_type, a.created_at,
              a.round_step, a.pass_number, a.attempt_number_for_word_in_step,
              a.first_attempt_correct, a.eventually_correct, a.reveal_and_move_on,
              w.word, sn.note AS spelling_note
       FROM practice_attempts a
       JOIN words w ON w.id = a.word_id
       LEFT JOIN spelling_notes sn ON sn.word_id = w.id
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
        spelling_note: string | null;
      }
    | undefined;

  if (!row) throw new Error(`Unknown attempt ${attemptId} for session ${sessionId}`);

  const prompt = JSON.parse(row.prompt_json) as {
    prompt?: string;
    instruction?: string;
    choices?: string[];
    hints?: string[];
    targetWord?: string;
  };
  const expected = JSON.parse(row.expected_answer_json) as {
    canonicalAnswer?: string;
  };
  const attemptIds = db
    .prepare("SELECT id FROM practice_attempts WHERE session_id = ? ORDER BY created_at ASC, id ASC")
    .all(sessionId) as unknown as Array<{ id: string }>;
  const questionNumber = Math.max(1, attemptIds.findIndex((attempt) => attempt.id === attemptId) + 1);
  const isRoundAttempt = row.round_step !== null;

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
    submittedAnswer: row.submitted_answer ?? "",
    canonicalAnswer: expected.canonicalAnswer ?? row.word,
    isCorrect: row.is_correct === 1,
    failureType: row.failure_type,
    hintLevelUsed: row.hint_level_used,
    hints: prompt.hints ?? [],
    spellingNote: row.spelling_note,
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

  const latestRoundRow = db
    .prepare(
      `SELECT summary_json
       FROM practice_rounds
       WHERE learner_id = ? AND status = 'completed'
       ORDER BY ended_at DESC, started_at DESC
       LIMIT 1`
    )
    .get(defaultLearnerId()) as { summary_json: string } | undefined;
  const latestRound = latestRoundRow
    ? ((JSON.parse(latestRoundRow.summary_json) as SessionSummary).round ?? null)
    : null;

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
    closeToGreen,
    latestRound
  };
}

export function getParentWords(): ParentWordListItem[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT w.id, w.word, w.difficulty_level, d.definition, e.sentence AS example,
              s.meaning_mastery, s.usage_mastery, s.spelling_mastery,
              s.stability_days, s.attempt_count, s.correct_count, s.wrong_count,
              s.last_hint_level_used, s.average_hint_level_used,
              s.average_response_time_ms, s.last_seen_at, s.last_correct_at,
              s.last_wrong_at, s.next_review_at, s.failure_types_json,
              s.confused_with_word_ids_json, s.near_review,
              s.eligible_questions_since_last_mistake, s.mastery_colour
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
    meaning_mastery: number | null;
    usage_mastery: number | null;
    spelling_mastery: number | null;
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
  }>;

  return rows.map((row) => {
    // Recompute the mastery colour from current state so the dashboard
    // reflects the live algorithm (not whatever was persisted last write).
    let masteryColour: LearnerWordState["masteryColour"] | null = null;
    if (row.attempt_count !== null) {
      const state: LearnerWordState = {
        id: `state_${defaultLearnerId()}_${row.id}`,
        learnerId: defaultLearnerId(),
        wordId: row.id,
        meaningMastery: row.meaning_mastery ?? 0,
        usageMastery: row.usage_mastery ?? 0,
        spellingMastery: row.spelling_mastery ?? 0,
        stabilityDays: row.stability_days ?? 1,
        masteryColour: row.mastery_colour ?? "red",
        lastSeenAt: row.last_seen_at,
        lastCorrectAt: row.last_correct_at,
        lastWrongAt: row.last_wrong_at,
        nextReviewAt: row.next_review_at,
        attemptCount: row.attempt_count ?? 0,
        correctCount: row.correct_count ?? 0,
        wrongCount: row.wrong_count ?? 0,
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
        eligibleQuestionsSinceLastMistake: row.eligible_questions_since_last_mistake ?? 0
      };
      masteryColour = state.attemptCount === 0 ? null : masteryColourForState(state);
    }
    return {
      id: row.id,
      word: row.word,
      definition: row.definition,
      example: row.example,
      masteryColour,
      difficultyLevel: row.difficulty_level,
      isComplete: Boolean(row.definition && row.example)
    };
  });
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

function getRemediationWordIds(db: DatabaseSync): {
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
    .all(defaultLearnerId()) as Array<{ word_id: string }>;

  const recoveredRows = db
    .prepare(
      `SELECT word_id
       FROM practice_attempts
       WHERE learner_id = ?
         AND eventually_correct = 1
         AND first_attempt_correct = 0
         AND reveal_and_move_on = 0
       GROUP BY word_id
       ORDER BY MAX(created_at) DESC`
    )
    .all(defaultLearnerId()) as Array<{ word_id: string }>;

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
  selectedCardId?: string
): SessionView {
  const wordIds = readRoundWordIds(round);
  const cardViewCounts = readCardViewCounts(round);
  const words = getPracticeWords();
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
  const cards = roundWords.map((word) => toRoundLearnCardView(word, cardViewCounts[word.id] ?? 0, selectionReasons.get(word.id) ?? null));
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
): { completed: boolean; attemptId: string | null } {
  if (session.status !== "in_progress" || round.status !== "in_progress") return { completed: true, attemptId: null };
  if (!isScoredRoundStep(round.current_step)) {
    throw new Error("This round is not ready for scored answers yet.");
  }

  const wordIds = readRoundWordIds(round);
  const attempts = getRoundStepAttempts(db, round.id);
  const cursor = nextRoundStepQuestion(wordIds, round.current_step, attempts, round.max_retry_passes);
  if (!cursor) {
    advanceRoundAfterStepIfReady(db, session.id, round);
    return { completed: false, attemptId: null };
  }

  const words = getPracticeWords();
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
    defaultLearnerId(),
    word.id,
    questionType,
    JSON.stringify({
      prompt: question.prompt,
      instruction: question.instruction,
      choices: question.choices,
      hints: question.hints,
      targetWord: question.targetWord
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

  saveLearnerWordState(db, updateStateAfterAttempt(word.state, outcome));
  db.prepare("UPDATE practice_sessions SET actual_question_count = actual_question_count + 1, updated_at = ? WHERE id = ?").run(
    now,
    session.id
  );

  const refreshedRound = getRoundRowForSession(db, session.id);
  if (!refreshedRound) throw new Error(`Round missing for session ${session.id}`);
  const completed = advanceRoundAfterStepIfReady(db, session.id, refreshedRound);

  return { completed, attemptId };
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

  const words = getPracticeWords();
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
  updateNearReviewAfterRound(db, wordIds, mistakeWordIds, completedAt, nowPlusNearReview);

  const refreshedWords = getPracticeWords();
  const refreshedWordMap = new Map(refreshedWords.map((word) => [word.id, word]));
  const nearReviewWordIds = wordIds.filter((wordId) => refreshedWordMap.get(wordId)?.state.nearReview);
  const spellingStillWeakWordIds = wordIds.filter((wordId) => (refreshedWordMap.get(wordId)?.state.spellingMastery ?? 0) < 0.78);
  const nearReviewWords = nearReviewWordIds.map(wordName);
  const eventuallyCorrectWords = eventuallyCorrectWordIds.map(wordName);
  const revealAndMoveOnWords = revealAndMoveOnWordIds.map(wordName);
  const firstAttemptSecureWords = firstAttemptSecureWordIds.map(wordName);
  const spellingStillWeakWords = spellingStillWeakWordIds.map(wordName);
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
      : "Defne completed this round with first-attempt meaning and context recall; spelling still needs separate proof before words turn green.";

  return {
    plan: wordIds.flatMap((wordId) => [
      { wordId, questionType: "definition_choice" },
      { wordId, questionType: "fill_sentence" }
    ]),
    wordsImproved: unique([...firstAttemptSecureWords, ...eventuallyCorrectWords]).slice(0, 8),
    spellingTraps: spellingStillWeakWords.slice(0, 8),
    revisitTomorrow: unique([...nearReviewWords, ...revealAndMoveOnWords]).slice(0, 8),
    round: {
      roundId: round.id,
      firstAttemptSecureWords,
      eventuallyCorrectWords,
      revealAndMoveOnWords,
      nearReviewWords,
      spellingStillWeakWords,
      selectionReasons: startedSummary.round?.selectionReasons ?? [],
      mistakeEvidence,
      explanation
    },
    completedAt
  };
}

function updateNearReviewAfterRound(db: DatabaseSync, wordIds: string[], mistakeWordIds: string[], now: string, nextReviewAt: string): void {
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
      ).run(nextReviewAt, now, defaultLearnerId(), wordId);
      continue;
    }

    const row = db
      .prepare(
        `SELECT near_review, eligible_questions_since_last_mistake
         FROM learner_word_state
         WHERE learner_id = ? AND word_id = ?`
      )
      .get(defaultLearnerId(), wordId) as
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
    ).run(keepNearReview ? 1 : 0, eligibleQuestions, now, defaultLearnerId(), wordId);
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
  word: PracticeWord,
  viewCount: number,
  selectionReason: RoundSelectionReason | null
): RoundLearnCardView {
  return {
    id: word.id,
    word: word.word,
    definition: word.definition,
    example: word.example,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    confusables: word.confusables,
    spellingNote: word.spellingNote,
    viewCount,
    supportMode: learnCardSupportMode(viewCount),
    activeRecallPrompt: activeRecallPrompt(word),
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
  if (step === "context_usage") return "Context usage";
  return "Spelling production";
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
       near_review = ?,
       eligible_questions_since_last_mistake = ?,
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
    state.nearReview ? 1 : 0,
    state.eligibleQuestionsSinceLastMistake,
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
    confusedWithWordIds: JSON.parse(row.confused_with_word_ids_json) as string[],
    nearReview: row.near_review === 1,
    eligibleQuestionsSinceLastMistake: row.eligible_questions_since_last_mistake
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
