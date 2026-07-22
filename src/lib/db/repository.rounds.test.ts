import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./index";
import { reconcileEarnedVocabularyMastery, seedInitialData } from "./seed";
import { spellingProgressStatus } from "../learning/spellingProgress";
import {
  createOrUpdateParentWord,
  findActiveWordByText,
  getMissionPreview,
  getVocabularyFocusOptions,
  getParentWords,
  getParentWordForEdit,
  getWordDetail,
  getSessionSummary,
  getSessionView,
  recordRoundCardView,
  setNextRoundMixPreference,
  startRoundMeaningRecognition,
  startRoundMission,
  submitSessionAnswer,
  updateParentWord,
  upsertParentExampleVisualCues
} from "./repository";
import {
  assignVocabularyWordToLearner,
  createLearner,
  listAvailableVocabularyForLearner,
  requestVocabularyWordNextRound,
  unassignVocabularyWordFromLearner,
} from "./learners";
import {
  assignSpellingItemToLearner,
  createOrUpdateParentSpellingItem,
  getChildSpellingWords,
  getParentSpellingItemForEdit,
  getParentSpellingItems,
  getSpellingPreview,
  getSpellingSessionView,
  getSpellingRoundMixPreference,
  requestSpellingItemNextRound,
  setSpellingRoundMixPreference,
  startSpellingPractice,
  startSpellingMission,
  submitSpellingAnswer,
  unassignSpellingItemFromLearner
} from "./spellingRepository";

let tempDir: string | null = null;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), "defne-rounds-"));
  process.env.DEFNE_DB_PATH = path.join(tempDir, "test.sqlite");
  resetDbForTests();
});

afterEach(() => {
  resetDbForTests();
  delete process.env.DEFNE_DB_PATH;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
});

describe("round repository orchestration", () => {
  it("keeps Defne assigned to the seeded deck while new children start empty", () => {
    const defneWords = getParentWords("learner_defne");
    expect(defneWords.length).toBeGreaterThanOrEqual(50);

    const learnerId = createLearner({ displayName: "Mina", accessCode: "mina" });
    expect(getParentWords(learnerId)).toEqual([]);

    const library = listAvailableVocabularyForLearner(learnerId);
    const candidate = library.find((word) => !word.assigned);
    expect(candidate).toBeTruthy();
    if (!candidate) throw new Error("Expected at least one available vocabulary word.");

    assignVocabularyWordToLearner(learnerId, candidate.id);
    expect(getParentWords(learnerId).map((word) => word.id)).toEqual([candidate.id]);
    expect(findActiveWordByText(candidate.word)?.id).toBe(candidate.id);
  });

  it("assigns a newly created parent word only to the selected child, even after reseeding", () => {
    const learnerId = createLearner({ displayName: "Lina", accessCode: "lina" });
    const wordId = createOrUpdateParentWord(
      {
        word: "glimmer",
        definition: "a small weak light",
        examples: ["A glimmer shone under the door."],
        difficultyLevel: 2
      },
      learnerId
    );

    expect(getParentWords(learnerId).map((word) => word.id)).toContain(wordId);
    expect(getParentWords("learner_defne").map((word) => word.id)).not.toContain(wordId);

    seedInitialData(getDb());

    expect(getParentWords(learnerId).map((word) => word.id)).toContain(wordId);
    expect(getParentWords("learner_defne").map((word) => word.id)).not.toContain(wordId);
  });

  it("lets parent priority place an assigned vocabulary word in the next round once without changing V2.1 scoring", () => {
    const learnerId = createLearner({ displayName: "Nora", accessCode: "nora" });
    const library = listAvailableVocabularyForLearner(learnerId).filter((word) => !word.assigned);
    const first = library[0];
    const second = library[1];
    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    if (!first || !second) throw new Error("Expected available vocabulary words.");

    assignVocabularyWordToLearner(learnerId, first.id);
    assignVocabularyWordToLearner(learnerId, second.id);
    requestVocabularyWordNextRound(learnerId, second.id);

    const sessionId = startRoundMission(6, learnerId);
    const view = getSessionView(sessionId);
    expect(view.round?.cards[0]?.id).toBe(second.id);
    expect(view.round?.cards[0]?.selectionReason?.reason).toBe("parent_next_round");

    const row = getDb()
      .prepare("SELECT priority_mode, priority_consumed_at FROM learner_vocabulary_words WHERE learner_id = ? AND word_id = ?")
      .get(learnerId, second.id) as { priority_mode: string; priority_consumed_at: string | null };
    expect(row.priority_mode).toBe("normal");
    expect(row.priority_consumed_at).toBeTruthy();
  });

  it("rebuilds an unstarted preview round when parent marks a word for the next round", () => {
    const learnerId = createLearner({ displayName: "Selin", accessCode: "selin" });
    const library = listAvailableVocabularyForLearner(learnerId).filter((word) => !word.assigned);
    const assigned = library.slice(0, 8);
    expect(assigned).toHaveLength(8);
    assigned.forEach((word) => assignVocabularyWordToLearner(learnerId, word.id));

    const originalSessionId = startRoundMission(6, learnerId);
    const originalView = getSessionView(originalSessionId);
    const priorityCandidate = assigned.find((word) => !originalView.round?.cards.some((card) => card.id === word.id));
    expect(priorityCandidate).toBeTruthy();
    if (!priorityCandidate) throw new Error("Expected a word outside the original preview.");

    requestVocabularyWordNextRound(learnerId, priorityCandidate.id);
    const preview = getMissionPreview(6, learnerId);

    expect(preview.words[0]?.id).toBe(priorityCandidate.id);
    const oldRound = getDb()
      .prepare("SELECT status FROM practice_rounds WHERE session_id = ?")
      .get(originalSessionId) as { status: string };
    expect(oldRound.status).toBe("abandoned");
  });

  it("rebuilds an unstarted preview round when the parent changes the next-round mix", () => {
    const learnerId = createLearner({ displayName: "Mira", accessCode: "mira" });
    const assigned = listAvailableVocabularyForLearner(learnerId).filter((word) => !word.assigned).slice(0, 8);
    expect(assigned).toHaveLength(8);
    assigned.forEach((word) => assignVocabularyWordToLearner(learnerId, word.id));

    const originalSessionId = startRoundMission(6, learnerId);
    setNextRoundMixPreference({ new: 5, recovery: 0, review: 1, stable: 0 }, learnerId);
    const preview = getMissionPreview(6, learnerId);

    const oldRound = getDb()
      .prepare("SELECT status FROM practice_rounds WHERE session_id = ?")
      .get(originalSessionId) as { status: string };
    expect(oldRound.status).toBe("abandoned");
    expect(preview.words.some((word) => word.selectionReason.reason === "new_word")).toBe(true);
  });

  it("resets an active attempted round when the parent changes the next-round mix", () => {
    const learnerId = createLearner({ displayName: "Nehir", accessCode: "nehir" });
    const assigned = listAvailableVocabularyForLearner(learnerId).filter((word) => !word.assigned).slice(0, 8);
    expect(assigned).toHaveLength(8);
    assigned.forEach((word) => assignVocabularyWordToLearner(learnerId, word.id));

    const originalSessionId = startRoundMission(6, learnerId);
    completeLearnCards(originalSessionId);
    startRoundMeaningRecognition(originalSessionId);
    const activeView = getSessionView(originalSessionId);
    expect(activeView.question?.canonicalAnswer).toBeTruthy();
    submitSessionAnswer({
      sessionId: originalSessionId,
      submittedAnswer: activeView.question?.canonicalAnswer ?? "",
      hintLevelUsed: 0,
      responseTimeMs: 1000
    });

    setNextRoundMixPreference({ new: 5, recovery: 0, review: 1, stable: 0 }, learnerId);
    const preview = getMissionPreview(6, learnerId);

    const oldRound = getDb()
      .prepare("SELECT status FROM practice_rounds WHERE session_id = ?")
      .get(originalSessionId) as { status: string };
    const oldSession = getDb()
      .prepare("SELECT status FROM practice_sessions WHERE id = ?")
      .get(originalSessionId) as { status: string };
    const activeRounds = getDb()
      .prepare("SELECT session_id FROM practice_rounds WHERE learner_id = ? AND status = 'in_progress'")
      .all(learnerId) as Array<{ session_id: string }>;

    expect(oldRound.status).toBe("abandoned");
    expect(oldSession.status).toBe("abandoned");
    expect(activeRounds.map((row) => row.session_id)).not.toContain(originalSessionId);
    expect(preview.words.some((word) => word.selectionReason.reason === "new_word")).toBe(true);
  });

  it("keeps an active attempted round when the parent saves the same next-round mix", () => {
    const learnerId = createLearner({ displayName: "Ela", accessCode: "ela" });
    const assigned = listAvailableVocabularyForLearner(learnerId).filter((word) => !word.assigned).slice(0, 8);
    expect(assigned).toHaveLength(8);
    assigned.forEach((word) => assignVocabularyWordToLearner(learnerId, word.id));

    const originalSessionId = startRoundMission(6, learnerId);
    completeLearnCards(originalSessionId);
    startRoundMeaningRecognition(originalSessionId);
    const activeView = getSessionView(originalSessionId);
    submitSessionAnswer({
      sessionId: originalSessionId,
      submittedAnswer: activeView.question?.canonicalAnswer ?? "",
      hintLevelUsed: 0,
      responseTimeMs: 1000
    });

    setNextRoundMixPreference({ new: 6, recovery: 3, review: 3, stable: 0 }, learnerId);

    const oldRound = getDb()
      .prepare("SELECT status FROM practice_rounds WHERE session_id = ?")
      .get(originalSessionId) as { status: string };
    const oldSession = getDb()
      .prepare("SELECT status FROM practice_sessions WHERE id = ?")
      .get(originalSessionId) as { status: string };

    expect(oldRound.status).toBe("in_progress");
    expect(oldSession.status).toBe("in_progress");
  });

  it("previews the in-progress round once it has been started", () => {
    // Once a round is committed, the cover preview must reflect that
    // round's word list — not run a fresh selection that could drift
    // because of randomised tie-breaks or recently-changed mastery.
    const sessionId = startRoundMission(6);
    const view = getSessionView(sessionId);
    const preview = getMissionPreview(6);

    expect(preview.words.map((word) => word.id)).toEqual(
      view.round?.cards.map((card) => card.id)
    );
    expect(preview.words.map((word) => word.selectionReason.reason)).toEqual(
      view.round?.cards.map((card) => card.selectionReason?.reason)
    );
  });

  it("keeps an existing round usable after a parent unassigns one of its words", () => {
    const learnerId = createLearner({ displayName: "Lev", accessCode: "lev-test" });
    const assigned = listAvailableVocabularyForLearner(learnerId)
      .filter((word) => !word.assigned)
      .slice(0, 8);
    expect(assigned).toHaveLength(8);
    assigned.forEach((word) => assignVocabularyWordToLearner(learnerId, word.id));

    const sessionId = startRoundMission(6, learnerId);
    const originalView = getSessionView(sessionId);
    const unassignedCard = originalView.round?.cards[0];
    expect(unassignedCard).toBeTruthy();
    if (!unassignedCard || !originalView.round) throw new Error("Expected a committed round card.");

    unassignVocabularyWordFromLearner(learnerId, unassignedCard.id);

    const viewAfterUnassign = getSessionView(sessionId);
    expect(viewAfterUnassign.round?.cards.map((card) => card.id)).toContain(unassignedCard.id);
    expect(getParentWords(learnerId).map((word) => word.id)).not.toContain(unassignedCard.id);

    for (const card of originalView.round.cards) {
      recordRoundCardView(sessionId, card.id);
      recordRoundCardView(sessionId, card.id);
    }
    startRoundMeaningRecognition(sessionId);

    const scoringView = getSessionView(sessionId);
    expect(scoringView.round?.word?.id).toBe(unassignedCard.id);
    expect(scoringView.question?.canonicalAnswer).toBeTruthy();
    expect(() =>
      submitSessionAnswer({
        sessionId,
        submittedAnswer: scoringView.question?.canonicalAnswer ?? "",
        hintLevelUsed: 0,
        responseTimeMs: 1200
      })
    ).not.toThrow();
  });

  it("keeps an unassigned seed vocabulary word out of a child deck after reseeding", () => {
    const wordId = getParentWords("learner_defne")[0]?.id;
    expect(wordId).toBeTruthy();
    if (!wordId) throw new Error("Expected seeded Defne vocabulary.");

    unassignVocabularyWordFromLearner("learner_defne", wordId);
    seedInitialData(getDb());

    expect(getParentWords("learner_defne").map((word) => word.id)).not.toContain(wordId);
    expect(listAvailableVocabularyForLearner("learner_defne").find((word) => word.id === wordId)?.assigned).toBe(false);
  });

  it("keeps the word detail badge on the earned colour while live confidence decays", () => {
    const learnerId = createLearner({ displayName: "Lev", accessCode: "lev-detail" });
    const word = listAvailableVocabularyForLearner(learnerId).find((candidate) => !candidate.assigned);
    expect(word).toBeTruthy();
    if (!word) throw new Error("Expected an available vocabulary word.");
    assignVocabularyWordToLearner(learnerId, word.id);

    const db = getDb();
    const oldSeenAt = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO learner_word_state
        (id, learner_id, word_id, stability_days, mastery_colour, last_seen_at, last_correct_at,
         attempt_count, correct_count, wrong_count, average_hint_level_used, average_response_time_ms,
         created_at, updated_at)
       VALUES (?, ?, ?, 10, 'green', ?, ?, 4, 4, 0, 0, 1000, ?, ?)`
    ).run(`state_${learnerId}_${word.id}`, learnerId, word.id, oldSeenAt, oldSeenAt, now, now);
    db.prepare(
      `INSERT INTO practice_sessions
        (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, ended_at, summary_json, created_at, updated_at)
       VALUES ('session_old_mastery_detail', ?, 'daily_mission', 'completed', 4, 4, ?, ?, '{}', ?, ?)`
    ).run(learnerId, oldSeenAt, oldSeenAt, oldSeenAt, oldSeenAt);
    const insertAttempt = db.prepare(
      `INSERT INTO practice_attempts
        (id, session_id, learner_id, word_id, question_type, prompt_json, expected_answer_json,
         submitted_answer, is_correct, hint_level_used, max_hint_level_available, response_time_ms, failure_type, created_at)
       VALUES (?, 'session_old_mastery_detail', ?, ?, 'definition_choice', '{}', '{}', 'correct', 1, 0, 0, 1000, 'none', ?)`
    );
    for (let idx = 0; idx < 4; idx += 1) {
      insertAttempt.run(`attempt_old_mastery_detail_${idx}`, learnerId, word.id, oldSeenAt);
    }

    const detail = getWordDetail(word.id, learnerId);

    expect(detail?.masteryColour).toBe("green");
    expect(detail?.scoreLowerBound).toBeGreaterThanOrEqual(0.8);
  });

  it("promotes under-counted earned mastery during startup reconciliation", () => {
    const learnerId = createLearner({ displayName: "Efe", accessCode: "efe-mastered" });
    const word = listAvailableVocabularyForLearner(learnerId).find((candidate) => !candidate.assigned);
    expect(word).toBeTruthy();
    if (!word) throw new Error("Expected an available vocabulary word.");
    assignVocabularyWordToLearner(learnerId, word.id);

    const db = getDb();
    const firstSeenAt = "2026-06-04T17:06:51.073Z";
    const lastSeenAt = "2026-06-09T16:38:09.839Z";
    const now = "2026-06-17T12:00:00.000Z";
    db.prepare(
      `INSERT INTO learner_word_state
        (id, learner_id, word_id, stability_days, mastery_colour, last_seen_at, last_correct_at,
         attempt_count, correct_count, wrong_count, average_hint_level_used, average_response_time_ms,
         created_at, updated_at)
       VALUES (?, ?, ?, 5.08, 'light_green', ?, ?, 12, 12, 0, 0, 1000, ?, ?)`
    ).run(`state_${learnerId}_${word.id}`, learnerId, word.id, lastSeenAt, lastSeenAt, firstSeenAt, firstSeenAt);
    db.prepare(
      `INSERT INTO practice_sessions
        (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, ended_at, summary_json, created_at, updated_at)
       VALUES ('session_under_counted_mastery', ?, 'daily_mission', 'completed', 12, 12, ?, ?, '{}', ?, ?)`
    ).run(learnerId, firstSeenAt, lastSeenAt, firstSeenAt, lastSeenAt);
    const insertAttempt = db.prepare(
      `INSERT INTO practice_attempts
        (id, session_id, learner_id, word_id, question_type, prompt_json, expected_answer_json,
         submitted_answer, is_correct, hint_level_used, max_hint_level_available, response_time_ms, failure_type, created_at)
       VALUES (?, 'session_under_counted_mastery', ?, ?, 'definition_choice', '{}', '{}', 'correct', 1, 0, 0, 1000, 'none', ?)`
    );
    [
      "2026-06-04T17:06:51.073Z",
      "2026-06-04T17:07:52.412Z",
      "2026-06-05T17:03:28.819Z",
      "2026-06-05T17:04:46.582Z",
      "2026-06-06T09:07:15.145Z",
      "2026-06-06T09:08:39.082Z",
      "2026-06-07T08:13:02.748Z",
      "2026-06-07T08:14:20.980Z",
      "2026-06-08T16:47:39.880Z",
      "2026-06-08T16:49:37.174Z",
      "2026-06-09T16:36:32.638Z",
      "2026-06-09T16:38:09.839Z"
    ].forEach((answeredAt, index) => {
      insertAttempt.run(`attempt_under_counted_mastery_${index}`, learnerId, word.id, answeredAt);
    });

    reconcileEarnedVocabularyMastery(db, now);

    const row = db
      .prepare("SELECT mastery_colour FROM learner_word_state WHERE learner_id = ? AND word_id = ?")
      .get(learnerId, word.id) as { mastery_colour: string };
    expect(row.mastery_colour).toBe("green");
  });

  it("does not let stale unfinished rounds override the current priority queue", () => {
    const db = getDb();
    const wordIds = (
      db.prepare("SELECT id FROM words WHERE status = 'active' ORDER BY word LIMIT 6").all() as Array<{
        id: string;
      }>
    ).map((row) => row.id);
    const staleStartedAt = "2026-05-01T09:00:00.000Z";
    const completedStartedAt = "2026-05-01T10:00:00.000Z";
    const completedEndedAt = "2026-05-01T10:30:00.000Z";
    const staleSummary = {
      plan: [],
      round: {
        roundId: "round_stale",
        firstAttemptSecureWords: [],
        eventuallyCorrectWords: [],
        revealAndMoveOnWords: [],
        nearReviewWords: [],
        selectionReasons: [],
        mistakeEvidence: [],
        explanation: "stale"
      }
    };

    db.prepare(
      `INSERT INTO practice_sessions
        (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, summary_json, created_at, updated_at)
       VALUES ('session_stale', 'learner_defne', 'daily_mission', 'in_progress', 12, 0, ?, ?, ?, ?)`
    ).run(staleStartedAt, JSON.stringify(staleSummary), staleStartedAt, staleStartedAt);
    db.prepare(
      `INSERT INTO practice_rounds
        (id, session_id, learner_id, status, current_step, max_retry_passes, word_ids_json,
         card_view_counts_json, started_at, summary_json, created_at, updated_at)
       VALUES ('round_stale', 'session_stale', 'learner_defne', 'in_progress', 'learn_cards', 3, ?, '{}', ?, ?, ?, ?)`
    ).run(JSON.stringify(wordIds), staleStartedAt, JSON.stringify(staleSummary), staleStartedAt, staleStartedAt);

    db.prepare(
      `INSERT INTO practice_sessions
        (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, ended_at, summary_json, created_at, updated_at)
       VALUES ('session_completed_later', 'learner_defne', 'daily_mission', 'completed', 12, 12, ?, ?, '{}', ?, ?)`
    ).run(completedStartedAt, completedEndedAt, completedStartedAt, completedEndedAt);
    db.prepare(
      `INSERT INTO practice_rounds
        (id, session_id, learner_id, status, current_step, max_retry_passes, word_ids_json,
         card_view_counts_json, started_at, ended_at, summary_json, created_at, updated_at)
       VALUES ('round_completed_later', 'session_completed_later', 'learner_defne', 'completed', 'context_usage', 3, ?, '{}', ?, ?, '{}', ?, ?)`
    ).run(JSON.stringify(wordIds), completedStartedAt, completedEndedAt, completedStartedAt, completedEndedAt);

    getMissionPreview(6);

    const staleRound = db
      .prepare("SELECT status FROM practice_rounds WHERE id = 'round_stale'")
      .get() as { status: string };
    const staleSession = db
      .prepare("SELECT status FROM practice_sessions WHERE id = 'session_stale'")
      .get() as { status: string };
    const activeRounds = db
      .prepare("SELECT id FROM practice_rounds WHERE learner_id = 'learner_defne' AND status = 'in_progress'")
      .all() as Array<{ id: string }>;

    expect(staleRound.status).toBe("abandoned");
    expect(staleSession.status).toBe("abandoned");
    expect(activeRounds.map((row) => row.id)).not.toContain("round_stale");
  });

  it("abandons old unstarted preview rounds before rendering a new preview", () => {
    const db = getDb();
    const wordIds = (
      db.prepare("SELECT id FROM words WHERE status = 'active' ORDER BY word LIMIT 12").all() as Array<{
        id: string;
      }>
    ).map((row) => row.id);
    const oldStartedAt = new Date(Date.now() - 25 * 3_600_000).toISOString();
    const staleSummary = {
      plan: [],
      round: {
        roundId: "round_old_preview",
        firstAttemptSecureWords: [],
        eventuallyCorrectWords: [],
        revealAndMoveOnWords: [],
        nearReviewWords: [],
        selectionReasons: [],
        mistakeEvidence: [],
        explanation: "old preview"
      }
    };

    db.prepare(
      `INSERT INTO practice_sessions
        (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, summary_json, created_at, updated_at)
       VALUES ('session_old_preview', 'learner_defne', 'daily_mission', 'in_progress', 12, 0, ?, ?, ?, ?)`
    ).run(oldStartedAt, JSON.stringify(staleSummary), oldStartedAt, oldStartedAt);
    db.prepare(
      `INSERT INTO practice_rounds
        (id, session_id, learner_id, status, current_step, max_retry_passes, word_ids_json,
         card_view_counts_json, started_at, summary_json, created_at, updated_at)
       VALUES ('round_old_preview', 'session_old_preview', 'learner_defne', 'in_progress', 'learn_cards', 3, ?, '{}', ?, ?, ?, ?)`
    ).run(JSON.stringify(wordIds), oldStartedAt, JSON.stringify(staleSummary), oldStartedAt, oldStartedAt);

    const preview = getMissionPreview(12);

    const oldRound = db
      .prepare("SELECT status FROM practice_rounds WHERE id = 'round_old_preview'")
      .get() as { status: string };
    const activeRounds = db
      .prepare("SELECT id FROM practice_rounds WHERE learner_id = 'learner_defne' AND status = 'in_progress'")
      .all() as Array<{ id: string }>;

    expect(oldRound.status).toBe("abandoned");
    expect(activeRounds.map((row) => row.id)).not.toContain("round_old_preview");
    expect(preview.targetQuestionCount).toBe(12);
  });

  it("abandons an unstarted preview that lacks a new word when unpracticed words exist", () => {
    const db = getDb();
    const wordIds = (
      db.prepare(
        `SELECT w.id
         FROM words w
         JOIN learner_vocabulary_words lvw ON lvw.word_id = w.id AND lvw.learner_id = 'learner_defne'
         JOIN learner_word_state s ON s.word_id = w.id AND s.learner_id = 'learner_defne'
         WHERE w.status = 'active' AND lvw.status = 'active' AND s.attempt_count > 0
         ORDER BY w.word
         LIMIT 12`
      ).all() as Array<{ id: string }>
    ).map((row) => row.id);
    const startedAt = new Date().toISOString();
    const staleSummary = {
      plan: [],
      round: {
        roundId: "round_no_new_word_preview",
        firstAttemptSecureWords: [],
        eventuallyCorrectWords: [],
        revealAndMoveOnWords: [],
        nearReviewWords: [],
        selectionReasons: wordIds.map((wordId) => ({
          wordId,
          word: wordId,
          reason: "useful_practice",
          label: "Useful practice",
          detail: "Existing preview"
        })),
        mistakeEvidence: [],
        explanation: "preview without an introduction"
      }
    };

    db.prepare(
      `INSERT INTO practice_sessions
        (id, learner_id, mode, status, target_question_count, actual_question_count, started_at, summary_json, created_at, updated_at)
       VALUES ('session_no_new_word_preview', 'learner_defne', 'daily_mission', 'in_progress', 12, 0, ?, ?, ?, ?)`
    ).run(startedAt, JSON.stringify(staleSummary), startedAt, startedAt);
    db.prepare(
      `INSERT INTO practice_rounds
        (id, session_id, learner_id, status, current_step, max_retry_passes, word_ids_json,
         card_view_counts_json, started_at, summary_json, created_at, updated_at)
       VALUES ('round_no_new_word_preview', 'session_no_new_word_preview', 'learner_defne', 'in_progress', 'learn_cards', 3, ?, '{}', ?, ?, ?, ?)`
    ).run(JSON.stringify(wordIds), startedAt, JSON.stringify(staleSummary), startedAt, startedAt);

    const preview = getMissionPreview(12);

    const oldRound = db
      .prepare("SELECT status FROM practice_rounds WHERE id = 'round_no_new_word_preview'")
      .get() as { status: string };

    expect(oldRound.status).toBe("abandoned");
    expect(preview.words.some((word) => word.selectionReason.reason === "new_word")).toBe(true);
  });

  it("abandons an in-progress round when the requested round size changes", () => {
    const sessionId = startRoundMission(6);
    const originalView = getSessionView(sessionId);
    expect(originalView.round?.cards).toHaveLength(6);

    const preview = getMissionPreview(12);
    const db = getDb();
    const originalRound = db
      .prepare("SELECT status FROM practice_rounds WHERE session_id = ?")
      .get(sessionId) as { status: string };
    const activeRound = db
      .prepare(
        `SELECT json_array_length(word_ids_json) AS word_count
         FROM practice_rounds
         WHERE learner_id = 'learner_defne' AND status = 'in_progress'
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get() as { word_count: number };

    expect(originalRound.status).toBe("abandoned");
    expect(activeRound.word_count).toBe(12);
    expect(preview.targetQuestionCount).toBe(12);
  });

  it("unlocks meaning after two card views and stores first-attempt versus recovery evidence", () => {
    const sessionId = startRoundMission(6);
    completeLearnCards(sessionId);

    let view = getSessionView(sessionId);
    expect(view.round?.currentStep).toBe("learn_cards");
    expect(view.round?.canUnlockMeaning).toBe(true);

    startRoundMeaningRecognition(sessionId);
    view = getSessionView(sessionId);
    expect(view.round?.currentStep).toBe("meaning_recognition");
    expect(view.round?.question?.questionType).toBe("definition_choice");

    const missedWordId = view.word?.id;
    if (!missedWordId) throw new Error("Expected a first meaning word");
    submitSessionAnswer({
      sessionId,
      submittedAnswer: "not the right definition",
      hintLevelUsed: 0,
      responseTimeMs: 1200
    });

    view = getSessionView(sessionId);
    while (view.round?.currentStep === "meaning_recognition" && view.round.passNumber === 1 && view.question) {
      submitSessionAnswer({
        sessionId,
        submittedAnswer: view.question.canonicalAnswer,
        hintLevelUsed: 0,
        responseTimeMs: 1000
      });
      view = getSessionView(sessionId);
    }

    expect(view.round?.currentStep).toBe("meaning_recognition");
    expect(view.round?.passNumber).toBe(2);
    expect(view.word?.id).toBe(missedWordId);

    submitSessionAnswer({
      sessionId,
      submittedAnswer: view.question?.canonicalAnswer ?? "",
      hintLevelUsed: 0,
      responseTimeMs: 1000
    });

    const rows = getDb()
      .prepare(
        `SELECT round_step, pass_number, attempt_number_for_word_in_step, first_attempt_correct, eventually_correct, reveal_and_move_on
         FROM practice_attempts
         WHERE session_id = ? AND word_id = ?
         ORDER BY created_at ASC, id ASC`
      )
      .all(sessionId, missedWordId) as Array<{
      round_step: string;
      pass_number: number;
      attempt_number_for_word_in_step: number;
      first_attempt_correct: number;
      eventually_correct: number;
      reveal_and_move_on: number;
    }>;

    expect(rows).toEqual([
      {
        round_step: "meaning_recognition",
        pass_number: 1,
        attempt_number_for_word_in_step: 1,
        first_attempt_correct: 0,
        eventually_correct: 0,
        reveal_and_move_on: 0
      },
      {
        round_step: "meaning_recognition",
        pass_number: 2,
        attempt_number_for_word_in_step: 2,
        first_attempt_correct: 0,
        eventually_correct: 1,
        reveal_and_move_on: 0
      }
    ]);

    view = getSessionView(sessionId);
    expect(view.round?.currentStep).toBe("context_usage");
  });

  it("uses the next canonical example on the second learn-card exposure", () => {
    const sessionId = startRoundMission(6);
    const view = getSessionView(sessionId);
    const card = view.round?.selectedCard;
    if (!card) throw new Error("Expected a learn card");

    const examples = getDb()
      .prepare(
        `SELECT sentence
         FROM word_examples
         WHERE word_id = ? AND status = 'approved'
         ORDER BY id ASC`
      )
      .all(card.id) as Array<{ sentence: string }>;
    expect(examples.length).toBeGreaterThanOrEqual(2);
    expect(card.example).toBe(examples[0].sentence);

    recordRoundCardView(sessionId, card.id);
    const secondView = getSessionView(sessionId, card.id);
    expect(secondView.round?.selectedCard?.example).toBe(examples[1].sentence);
  });

  it("marks reveal-and-move-on after the retry cap and keeps the word in near review", () => {
    const sessionId = startRoundMission(6);
    completeLearnCards(sessionId);
    startRoundMeaningRecognition(sessionId);
    answerCurrentStepCorrectly(sessionId, "meaning_recognition");

    let view = getSessionView(sessionId);
    expect(view.round?.currentStep).toBe("context_usage");
    const revealedWord = view.word?.word ?? "";

    submitSessionAnswer({ sessionId, submittedAnswer: "wrong one", hintLevelUsed: 0, responseTimeMs: 1000 });
    view = getSessionView(sessionId);
    while (view.round?.currentStep === "context_usage" && view.round.passNumber === 1 && view.question) {
      submitSessionAnswer({ sessionId, submittedAnswer: view.question.canonicalAnswer, hintLevelUsed: 0, responseTimeMs: 900 });
      view = getSessionView(sessionId);
    }

    expect(view.round?.passNumber).toBe(2);
    submitSessionAnswer({ sessionId, submittedAnswer: "still wrong", hintLevelUsed: 0, responseTimeMs: 900 });
    view = getSessionView(sessionId);
    expect(view.round?.passNumber).toBe(3);
    submitSessionAnswer({ sessionId, submittedAnswer: "wrong again", hintLevelUsed: 0, responseTimeMs: 900 });

    const summary = getSessionSummary(sessionId);
    expect(summary.round?.revealAndMoveOnWords).toContain(revealedWord);
    expect(summary.round?.nearReviewWords).toContain(revealedWord);
    expect(summary.round?.mistakeEvidence).toContainEqual(
      expect.objectContaining({
        word: revealedWord,
        contextMistakes: 3,
        totalMistakes: 3
      })
    );
    expect(summary.round?.selectionReasons?.map((reason) => reason.word)).toContain(revealedWord);

    const row = getDb()
      .prepare(
        `SELECT s.near_review, s.next_review_at
         FROM learner_word_state s
         JOIN words w ON w.id = s.word_id
         WHERE w.word = ?`
      )
      .get(revealedWord) as { near_review: number; next_review_at: string | null };

    expect(row.near_review).toBe(1);
    expect(row.next_review_at).toBeTruthy();
  });

  it("records revealed words as recovery debt without forcing immediate repetition", () => {
    const revealedWord = completeRoundWithFirstContextWordRevealed();

    const row = getDb()
      .prepare(
        `SELECT s.near_review, s.recovery_debt, s.last_revealed_at, s.last_clean_retrieval_at
         FROM learner_word_state s
         JOIN words w ON w.id = s.word_id
         WHERE w.word = ?`
      )
      .get(revealedWord) as {
      near_review: number;
      recovery_debt: number;
      last_revealed_at: string | null;
      last_clean_retrieval_at: string | null;
    };

    expect(row.near_review).toBe(1);
    expect(row.recovery_debt).toBeGreaterThanOrEqual(3);
    expect(row.last_revealed_at).toBeTruthy();
    expect(new Date(row.last_revealed_at ?? 0).getTime()).toBeGreaterThan(
      new Date(row.last_clean_retrieval_at ?? 0).getTime()
    );
  });

  it("does not clear lower recovery debt from another same-day clean answer", () => {
    const sessionId = startRoundMission(6);
    completeLearnCards(sessionId);
    startRoundMeaningRecognition(sessionId);

    const view = getSessionView(sessionId);
    const wordId = view.word?.id;
    const canonicalAnswer = view.question?.canonicalAnswer;
    if (!wordId || !canonicalAnswer) throw new Error("Expected a meaning recognition question");

    const sameDayFailure = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
    getDb()
      .prepare(
        `UPDATE learner_word_state
         SET recovery_debt = 2,
             last_wrong_at = ?,
             last_practiced_session_id = ?,
             last_practiced_interaction_index = 0
         WHERE learner_id = 'learner_defne' AND word_id = ?`
      )
      .run(sameDayFailure, sessionId, wordId);

    submitSessionAnswer({
      sessionId,
      submittedAnswer: canonicalAnswer,
      hintLevelUsed: 0,
      responseTimeMs: 900
    });

    const row = getDb()
      .prepare(
        `SELECT recovery_debt, last_clean_retrieval_at
         FROM learner_word_state
         WHERE learner_id = 'learner_defne' AND word_id = ?`
      )
      .get(wordId) as { recovery_debt: number; last_clean_retrieval_at: string | null };

    expect(row.last_clean_retrieval_at).toBeTruthy();
    expect(row.recovery_debt).toBe(2);
  });

  it("resets learner state when parent edits change word content", () => {
    const db = getDb();
    const word = db
      .prepare(
        `SELECT w.id, w.word, w.content_version
         FROM words w
         JOIN word_definitions d ON d.word_id = w.id AND d.is_primary = 1
         JOIN word_examples e ON e.word_id = w.id AND e.status = 'approved'
         ORDER BY w.word ASC
         LIMIT 1`
      )
      .get() as { id: string; word: string; content_version: number };

    db.prepare(
      `UPDATE learner_word_state
       SET stability_days = 12,
           mastery_colour = 'green',
           attempt_count = 5,
           correct_count = 5,
           last_clean_retrieval_at = '2026-05-01T10:00:00.000Z',
           learner_state_content_version = ?
       WHERE learner_id = 'learner_defne' AND word_id = ?`
    ).run(word.content_version, word.id);

    createOrUpdateParentWord({
      word: word.word,
      difficultyLevel: 2,
      definition: "A corrected parent definition.",
      example: `A corrected example for ${word.word}.`
    });

    const row = db
      .prepare(
        `SELECT w.content_version, s.learner_state_content_version, s.mastery_colour,
                s.attempt_count, s.correct_count, s.last_clean_retrieval_at
         FROM words w
         JOIN learner_word_state s ON s.word_id = w.id AND s.learner_id = 'learner_defne'
         WHERE w.id = ?`
      )
      .get(word.id) as {
      content_version: number;
      learner_state_content_version: number;
      mastery_colour: string;
      attempt_count: number;
      correct_count: number;
      last_clean_retrieval_at: string | null;
    };

    expect(row.content_version).toBeGreaterThan(word.content_version);
    expect(row.learner_state_content_version).toBe(row.content_version);
    expect(row.mastery_colour).toBe("red");
    expect(row.attempt_count).toBe(0);
    expect(row.correct_count).toBe(0);
    expect(row.last_clean_retrieval_at).toBeNull();
  });

  it("stores multiple parent examples and example-linked visual cues", () => {
    const wordId = createOrUpdateParentWord({
      word: "reluctant",
      difficultyLevel: 2,
      definition: "Not willing or not keen to do something straight away.",
      examples: [
        "Mina felt reluctant to step onto the diving board, so she watched three others jump before edging forward herself.",
        "The puppy was reluctant to leave the blanket by the radiator until the room had warmed up again.",
        "After the argument, he was reluctant to knock on the neighbour's door, even though he knew he should apologise."
      ],
      synonyms: ["hesitant", "unwilling"],
      antonyms: ["eager", "keen"],
      confusables: ["reticent", "hesitant"]
    });

    upsertParentExampleVisualCues(wordId, [
      {
        exampleIndex: 0,
        provider: "gemini",
        model: "gemini-3.1-flash-image-preview",
        promptVersion: "example-cue-sketch-v1",
        prompt: "prompt one",
        imagePath: "/assets/example-cues/drafts/word_reluctant/draft_example_0-test.jpg"
      },
      {
        exampleIndex: 2,
        provider: "gemini",
        model: "gemini-3.1-flash-image-preview",
        promptVersion: "example-cue-sketch-v1",
        prompt: "prompt three",
        imagePath: "/assets/example-cues/drafts/word_reluctant/draft_example_2-test.jpg"
      }
    ]);

    const db = getDb();
    const examples = db
      .prepare("SELECT id FROM word_examples WHERE word_id = ? ORDER BY id ASC")
      .all(wordId) as Array<{ id: string }>;
    const synonyms = db.prepare("SELECT synonym FROM word_synonyms WHERE word_id = ? ORDER BY id ASC").all(wordId) as Array<{
      synonym: string;
    }>;
    const antonyms = db.prepare("SELECT antonym FROM word_antonyms WHERE word_id = ? ORDER BY id ASC").all(wordId) as Array<{
      antonym: string;
    }>;
    const confusables = db
      .prepare("SELECT confusable_text FROM word_confusables WHERE word_id = ? ORDER BY id ASC")
      .all(wordId) as Array<{ confusable_text: string }>;
    const cues = db
      .prepare("SELECT example_id, image_path, status FROM example_visual_cues WHERE word_id = ? ORDER BY example_id ASC")
      .all(wordId) as Array<{ example_id: string; image_path: string; status: string }>;

    expect(examples.map((row) => row.id)).toEqual([`example_${wordId}_0`, `example_${wordId}_1`, `example_${wordId}_2`]);
    expect(synonyms.map((row) => row.synonym)).toEqual(["hesitant", "unwilling"]);
    expect(antonyms.map((row) => row.antonym)).toEqual(["eager", "keen"]);
    expect(confusables.map((row) => row.confusable_text)).toEqual(["reticent", "hesitant"]);
    expect(cues).toEqual([
      {
        example_id: `example_${wordId}_0`,
        image_path: "public/assets/example-cues/drafts/word_reluctant/draft_example_0-test.jpg",
        status: "approved"
      },
      {
        example_id: `example_${wordId}_2`,
        image_path: "public/assets/example-cues/drafts/word_reluctant/draft_example_2-test.jpg",
        status: "approved"
      }
    ]);
  });

  it("loads vocabulary edit values from reviewed parent content", () => {
    const wordId = createOrUpdateParentWord({
      word: "reluctant",
      difficultyLevel: 2,
      definition: "Not willing or not keen to do something straight away.",
      examples: [
        "Mina felt reluctant to step onto the diving board.",
        "The puppy was reluctant to leave the blanket."
      ],
      synonyms: ["hesitant", "unwilling"],
      antonyms: ["eager", "keen"]
    });

    expect(getParentWordForEdit(wordId)).toMatchObject({
      id: wordId,
      word: "reluctant",
      definition: "Not willing or not keen to do something straight away.",
      examples: [
        "Mina felt reluctant to step onto the diving board.",
        "The puppy was reluctant to leave the blanket."
      ],
      synonyms: ["hesitant", "unwilling"],
      antonyms: ["eager", "keen"]
    });
  });

  it("updates an existing vocabulary word in place", () => {
    const wordId = createOrUpdateParentWord({
      word: "recieve",
      definition: "A misspelled shell.",
      example: "Mina will recieve the letter."
    });

    const updatedId = updateParentWord({
      wordId,
      word: "receive",
      definition: "To get or be given something.",
      examples: ["Mina will receive the letter before lunch."],
      synonyms: ["get"],
      antonyms: ["send"]
    });

    expect(updatedId).toBe(wordId);
    expect(getParentWordForEdit(wordId)).toMatchObject({
      word: "receive",
      definition: "To get or be given something.",
      examples: ["Mina will receive the letter before lunch."],
      synonyms: ["get"],
      antonyms: ["send"]
    });
  });

  it("finds active words by normalized text before generation", () => {
    createOrUpdateParentWord({
      word: "Brisk",
      definition: "Quick and energetic.",
      example: "Mina walked at a brisk pace and reached the gate before the bell."
    });

    expect(findActiveWordByText("  brisk  ")?.word).toBe("brisk");
    expect(findActiveWordByText("briskly")).toBeNull();
  });

  it("stores parent vocabulary words lowercased when creating or editing", () => {
    const wordId = createOrUpdateParentWord({
      word: "ImMense",
      definition: "Extremely large.",
      example: "The immense hall could fit the whole school."
    });

    expect(getParentWordForEdit(wordId)?.word).toBe("immense");

    updateParentWord({
      wordId,
      word: "GLORMISH",
      definition: "A made-up test word.",
      examples: ["The glormish prop filled the whole test stage."]
    });

    expect(getParentWordForEdit(wordId)?.word).toBe("glormish");
  });
});

describe("spelling repository orchestration", () => {
  it("lets parents add reviewed spelling items with an optional confusable pair", () => {
    const itemId = createOrUpdateParentSpellingItem({
      target: "practise",
      pairedTarget: "practice",
      usageLabel: "verb",
      teachingNote: "Practise is a verb. It means to do something repeatedly to improve.",
      sentences: ["Mina will practise piano before dinner."],
      difficultyLevel: 2
    });

    const items = getParentSpellingItems();
    const saved = items.find((item) => item.id === itemId);
    const pair = items.find((item) => item.target === "practice");

    expect(saved).toMatchObject({
      target: "practise",
      usageLabel: "verb",
      promptCount: 1
    });
    expect(pair).toMatchObject({
      target: "practice",
      promptCount: 0
    });

    const preview = getSpellingPreview(400);
    expect(preview.items.some((item) => item.target === "practise")).toBe(true);
    expect(preview.items.some((item) => item.target === "practice")).toBe(false);
  });

  it("returns correct and wrong counts for parent spelling progress views", () => {
    const itemId = createOrUpdateParentSpellingItem({
      target: "separate",
      usageLabel: "adjective",
      teachingNote: "Separate has a in the middle.",
      sentences: [
        "Keep the wet coats in a separate basket.",
        "We used a separate page for the diagram.",
      ],
    });
    insertSpellingAttemptHistory(itemId, [true, false, true]);

    expect(getParentSpellingItems().find((item) => item.id === itemId)).toMatchObject({
      promptCount: 2,
      attemptCount: 3,
      correctCount: 2,
      wrongCount: 1,
    });
  });

  it("assigns a newly created parent spelling item only to the selected child, even after reseeding", () => {
    const learnerId = createLearner({ displayName: "Noa", accessCode: "noa" });
    const itemId = createOrUpdateParentSpellingItem(
      {
        target: "glimmering",
        usageLabel: "adjective",
        teachingNote: "Glimmering means shining softly.",
        sentences: ["The glimmering light helped Mina find the path."],
        difficultyLevel: 2
      },
      learnerId
    );

    expect(getParentSpellingItems(learnerId).map((item) => item.id)).toContain(itemId);
    expect(getParentSpellingItems("learner_defne").map((item) => item.id)).not.toContain(itemId);

    seedInitialData(getDb());

    expect(getParentSpellingItems(learnerId).map((item) => item.id)).toContain(itemId);
    expect(getParentSpellingItems("learner_defne").map((item) => item.id)).not.toContain(itemId);
  });

  it("keeps an unassigned seed spelling item out of a child deck after reseeding", () => {
    const itemId = getParentSpellingItems("learner_defne")[0]?.id;
    expect(itemId).toBeTruthy();
    if (!itemId) throw new Error("Expected seeded Defne spelling items.");

    unassignSpellingItemFromLearner("learner_defne", itemId);
    seedInitialData(getDb());

    expect(getParentSpellingItems("learner_defne").map((item) => item.id)).not.toContain(itemId);
  });

  it("loads and updates existing spelling items without seed refresh overwriting parent edits", () => {
    createOrUpdateParentSpellingItem({
      target: "advice",
      pairedTarget: "advise",
      usageLabel: "noun",
      teachingNote: "Advice is a noun. It means a helpful suggestion.",
      sentences: ["The careful advice helped Mira choose the safer path."],
      difficultyLevel: 2
    });

    seedInitialData(getDb());
    const edited = getParentSpellingItemForEdit("spelling_advice");

    expect(edited).toMatchObject({
      target: "advice",
      pairedTarget: "advise",
      usageLabel: "noun",
      teachingNote: "Advice is a noun. It means a helpful suggestion."
    });
    expect(edited?.sentences).toEqual(["The careful advice helped Mira choose the safer path."]);
  });

  it("normalises casing when updating a spelling target", () => {
    const createdItemId = createOrUpdateParentSpellingItem({
      target: "İmmediately",
      usageLabel: "adverb",
      teachingNote: "Capital-I variant with a different character.",
      sentences: ["The child can immediately answer this question."],
      difficultyLevel: 2
    });

    const updatedId = createOrUpdateParentSpellingItem({
      itemId: createdItemId,
      target: "Immediately",
      usageLabel: "adverb",
      teachingNote: "English spelling variant.",
      sentences: ["The child can immediately answer this question."],
      difficultyLevel: 2
    });

    expect(updatedId).toBe(createdItemId);
    const edited = getParentSpellingItemForEdit(createdItemId);

    expect(edited?.target).toBe("immediately");
    expect(edited?.teachingNote).toBe("English spelling variant.");
    expect(getParentSpellingItems().find((item) => item.id === updatedId)?.target).toBe("immediately");
    expect(getParentSpellingItems().find((item) => item.id === `spelling_immediately`)).toMatchObject({ target: "immediately" });
  });

  it("removes stale paired words when the spelling pair is changed", () => {
    const itemId = createOrUpdateParentSpellingItem({
      target: "flonq",
      pairedTarget: "bruxel",
      usageLabel: "adjective",
      teachingNote: "Testing stale pair cleanup.",
      sentences: ["The child can repeat this flonq phrase accurately."],
      difficultyLevel: 2
    });

    expect(getParentSpellingItems().find((item) => item.id !== itemId && item.target === "bruxel")?.target).toBe("bruxel");

    const updatedId = createOrUpdateParentSpellingItem({
      itemId,
      target: "flonq",
      pairedTarget: "vibrell",
      usageLabel: "adjective",
      teachingNote: "Pair updated to clean up stale row.",
      sentences: ["The child can repeat this flonq phrase accurately."],
      difficultyLevel: 2
    });

    expect(updatedId).toBe(itemId);
    expect(getParentSpellingItems().find((item) => item.id !== itemId && item.target === "bruxel")).toBeUndefined();
    expect(getParentSpellingItems().find((item) => item.id !== itemId && item.target === "vibrell")).toMatchObject({ target: "vibrell" });
  });

  it("starts a spelling session from the separate spelling list", () => {
    const preview = getSpellingPreview(4);
    const sessionId = startSpellingMission(4);
    const view = getSpellingSessionView(sessionId);

    expect(preview.items).toHaveLength(4);
    expect(view.totalQuestions).toBe(4);
    expect(view.phase).toBe("intro");
    expect(view.question).toBeNull();
    expect(view.studyGroups[0].items[0].target).toBe(preview.items[0].target);
    expect(view.studyGroups[0].items[0].teachingNote).toBeTruthy();
    expect(view.wordBank).toEqual(preview.items.map((item) => item.target));

    startSpellingPractice(sessionId);
    const practice = getSpellingSessionView(sessionId);
    expect(practice.phase).toBe("practice");
    expect(practice.question?.target).toBe(preview.items[0].target);
    expect(practice.question?.tokens.length).toBeGreaterThan(0);
    expect(practice.question?.displayedSentence.toLocaleLowerCase("en-GB")).toContain(preview.items[0].target);
  });

  it("mixes equally new spelling words instead of falling back to alphabetical order", () => {
    const preview = getSpellingPreview(12);
    const targets = preview.items.map((item) => item.target);

    expect(targets).not.toEqual([...targets].sort((a, b) => a.localeCompare(b)));
  });

  it("prioritizes spelling words with unresolved mistake debt", () => {
    insertSpellingAttemptHistory("spelling_advice", [false, false, true]);

    const preview = getSpellingPreview(1);

    expect(preview.items[0].target).toBe("advice");
  });

  it("uses per-child spelling bucket targets for the normal spelling mission", () => {
    insertSpellingAttemptHistory("spelling_advice", [false, false, true]);
    insertSpellingAttemptHistory("spelling_possible", [true, true]);
    const reviewAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    getDb()
      .prepare(
        `UPDATE spelling_learner_state
         SET last_seen_at = ?,
             last_correct_at = ?,
             last_practiced_at = ?,
             last_clean_retrieval_at = ?,
             updated_at = ?
         WHERE learner_id = 'learner_defne' AND item_id = 'spelling_possible'`
      )
      .run(reviewAt, reviewAt, reviewAt, reviewAt, reviewAt);
    setSpellingRoundMixPreference({ new: 6, recovery: 1, review: 1, stable: 0 }, "learner_defne");

    const preview = getSpellingPreview(8);

    expect(getSpellingRoundMixPreference("learner_defne")).toEqual({
      new: 6,
      recovery: 1,
      review: 1,
      stable: 0
    });
    expect(preview.items).toHaveLength(8);
    expect(preview.items.filter((item) => item.attemptCount === 0)).toHaveLength(6);
    expect(preview.items.some((item) => item.target === "advice")).toBe(true);
    expect(preview.items.some((item) => item.target === "possible")).toBe(true);
  });

  it("lets parent priority place an assigned spelling word in the next spelling mission once", () => {
    const learnerId = createLearner({ displayName: "Ozan", accessCode: "ozan" });
    const items = getDb()
      .prepare(
        `SELECT i.id
         FROM spelling_items i
         WHERE i.status = 'active'
           AND EXISTS (SELECT 1 FROM spelling_prompts p WHERE p.item_id = i.id AND p.status = 'approved')
         ORDER BY i.target_word ASC
         LIMIT 2`
      )
      .all() as Array<{ id: string }>;
    expect(items).toHaveLength(2);

    assignSpellingItemToLearner(learnerId, items[0].id);
    assignSpellingItemToLearner(learnerId, items[1].id);
    requestSpellingItemNextRound(learnerId, items[1].id);

    const sessionId = startSpellingMission(2, learnerId);
    const session = getDb()
      .prepare("SELECT item_ids_json FROM spelling_sessions WHERE id = ?")
      .get(sessionId) as { item_ids_json: string };
    expect(JSON.parse(session.item_ids_json)).toEqual([items[1].id, items[0].id]);

    const row = getDb()
      .prepare("SELECT priority_mode, priority_consumed_at FROM learner_spelling_items WHERE learner_id = ? AND item_id = ?")
      .get(learnerId, items[1].id) as { priority_mode: string; priority_consumed_at: string | null };
    expect(row.priority_mode).toBe("normal");
    expect(row.priority_consumed_at).toBeTruthy();
  });

  it("does not immediately repeat remediated spelling misses above untouched words", () => {
    insertSpellingAttemptHistory("spelling_advice", [false, false, false, false, true, true, true, true, true]);
    const recent = new Date(Date.now() - 30 * 60_000).toISOString();
    getDb().prepare("UPDATE spelling_attempts SET created_at = ? WHERE item_id = 'spelling_advice'").run(recent);
    getDb()
      .prepare(
        `UPDATE spelling_learner_state
         SET last_seen_at = ?,
             last_correct_at = ?,
             last_practiced_at = ?,
             last_clean_retrieval_at = ?
         WHERE item_id = 'spelling_advice'`
      )
      .run(recent, recent, recent, recent);

    const preview = getSpellingPreview(12);

    expect(preview.items.map((item) => item.target)).not.toContain("advice");
  });

  it("builds a child spelling word wall from active spelling items and attempts", () => {
    const initial = getChildSpellingWords();
    expect(initial.length).toBeGreaterThan(100);
    expect(initial[0]).toMatchObject({
      promptCount: expect.any(Number),
      attemptCount: 0,
      correctCount: 0,
      wrongCount: 0
    });

    const sessionId = startSpellingMission(1);
    startSpellingPractice(sessionId);
    const view = getSpellingSessionView(sessionId);
    const target = view.question?.target;
    if (!target) throw new Error("Expected a spelling target");

    submitSpellingAnswer({
      sessionId,
      submittedAnswer: view.question?.expectedSelection === "all_correct" ? "word:0" : "all_correct",
      responseTimeMs: 700
    });

    const updated = getChildSpellingWords().find((word) => word.target === target);
    expect(updated).toMatchObject({
      attemptCount: 1,
      correctCount: 0,
      wrongCount: 1
    });
  });

  it("lets a child run a strict one-round spelling colour focus", () => {
    insertSpellingAttemptHistory("spelling_advice", [false, false]);
    insertSpellingAttemptHistory("spelling_possible", [false, false]);

    const preview = getSpellingPreview(8, "learner_defne", "needs_work");
    expect(preview.focus).toBe("needs_work");
    expect(preview.source).toBe("new_round");
    expect(preview.targetItemCount).toBe(2);
    expect(preview.items.every((item) => spellingProgressStatus(item) === "needs_work")).toBe(true);

    const sessionId = startSpellingMission(8, "learner_defne", "needs_work");
    const sessionTargets = getSpellingSessionView(sessionId).wordBank;
    const statusByTarget = new Map(
      getChildSpellingWords().map((item) => [item.target, spellingProgressStatus(item)])
    );

    expect(sessionTargets).toHaveLength(2);
    expect(sessionTargets.every((target) => statusByTarget.get(target) === "needs_work")).toBe(true);
  });

  it("lets a child run a strict one-round vocabulary colour focus", () => {
    const db = getDb();
    const wordIds = (
      db.prepare(
        `SELECT w.id
         FROM words w
         JOIN learner_vocabulary_words lvw ON lvw.word_id = w.id AND lvw.learner_id = 'learner_defne'
         WHERE w.status = 'active' AND lvw.status = 'active'
         ORDER BY w.word
         LIMIT 2`
      ).all() as Array<{ id: string }>
    ).map((row) => row.id);
    expect(wordIds).toHaveLength(2);

    db.prepare(
      `UPDATE learner_word_state
       SET attempt_count = 2,
           wrong_count = 2,
           correct_count = 0,
           mastery_colour = 'red',
           last_seen_at = '2026-01-01T00:00:00.000Z',
           last_wrong_at = '2026-01-01T00:00:00.000Z',
           recovery_debt = 2
       WHERE learner_id = 'learner_defne' AND word_id IN (?, ?)`
    ).run(...wordIds);

    expect(getVocabularyFocusOptions("learner_defne").find((option) => option.colour === "red")?.eligibleCount).toBe(2);

    const preview = getMissionPreview(12, "learner_defne", "red");
    expect(preview.focus).toBe("red");
    expect(preview.source).toBe("new_round");
    expect(preview.targetQuestionCount).toBe(2);
    expect(preview.words.every((word) => word.masteryColour === "red")).toBe(true);

    const sessionId = startRoundMission(12, "learner_defne", "red");
    const sessionWordIds = getSessionView(sessionId).round?.cards.map((card) => card.id) ?? [];
    expect(sessionWordIds).toEqual(expect.arrayContaining(wordIds));
    expect(sessionWordIds).toHaveLength(2);
  });

  it("keeps active spelling items without approved prompts in the child progress count", () => {
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO spelling_items
          (id, target_word, normalized_target, difficulty_level, source, status, teaching_note, study_group, usage_label, created_at, updated_at)
         VALUES (?, ?, ?, 1, 'parent', 'active', '', '', '', ?, ?)`
      )
      .run("spelling_no_prompt", "unprompted", "unprompted", now, now);
    assignSpellingItemToLearner("learner_defne", "spelling_no_prompt");

    const childItem = getChildSpellingWords().find((word) => word.id === "spelling_no_prompt");
    const parentItem = getParentSpellingItems().find((word) => word.id === "spelling_no_prompt");

    expect(childItem).toMatchObject({
      promptCount: 0,
      attemptCount: 0,
      correctCount: 0,
      wrongCount: 0
    });
    expect(parentItem).toMatchObject({ promptCount: 0, attemptCount: 0 });
  });

  it("logs wrong spelling selections without advancing until the child finds the answer", () => {
    const sessionId = startSpellingMission(1);
    startSpellingPractice(sessionId);
    const view = getSpellingSessionView(sessionId);
    const answer = view.question?.expectedSelection;
    expect(answer).toBeTruthy();

    const wrong = submitSpellingAnswer({
      sessionId,
      submittedAnswer: "word:0",
      responseTimeMs: 900
    });
    const retry = getSpellingSessionView(sessionId, wrong.attemptId ?? undefined);

    expect(wrong.completed).toBe(false);
    expect(wrong.isCorrect).toBe(false);
    expect(retry.status).toBe("in_progress");
    expect(retry.questionNumber).toBe(1);
    expect(retry.question?.displayedSentence).toBe(view.question?.displayedSentence);
    expect(retry.lastResult).toMatchObject({
      isCorrect: false
    });

    const result = submitSpellingAnswer({
      sessionId,
      submittedAnswer: answer ?? "",
      responseTimeMs: 1200
    });
    const completed = getSpellingSessionView(sessionId, result.attemptId ?? undefined);

    expect(result.completed).toBe(true);
    expect(result.isCorrect).toBe(true);
    expect(completed.status).toBe("completed");
    expect(completed.lastResult).toMatchObject({
      isCorrect: true,
      correctAnswer: view.question?.target
    });
  });
});

function completeRoundWithFirstContextWordRevealed(): string {
  const sessionId = startRoundMission(6);
  completeLearnCards(sessionId);
  startRoundMeaningRecognition(sessionId);
  answerCurrentStepCorrectly(sessionId, "meaning_recognition");

  let view = getSessionView(sessionId);
  if (view.round?.currentStep !== "context_usage" || !view.word) {
    throw new Error("Expected context usage question");
  }
  const revealedWord = view.word.word;

  submitSessionAnswer({ sessionId, submittedAnswer: "wrong one", hintLevelUsed: 0, responseTimeMs: 1000 });
  view = getSessionView(sessionId);
  while (view.round?.currentStep === "context_usage" && view.round.passNumber === 1 && view.question) {
    submitSessionAnswer({ sessionId, submittedAnswer: view.question.canonicalAnswer, hintLevelUsed: 0, responseTimeMs: 900 });
    view = getSessionView(sessionId);
  }

  submitSessionAnswer({ sessionId, submittedAnswer: "still wrong", hintLevelUsed: 0, responseTimeMs: 900 });
  submitSessionAnswer({ sessionId, submittedAnswer: "wrong again", hintLevelUsed: 0, responseTimeMs: 900 });

  return revealedWord;
}

function completeLearnCards(sessionId: string): void {
  const view = getSessionView(sessionId);
  const cards = view.round?.cards ?? [];
  for (const card of cards) {
    recordRoundCardView(sessionId, card.id);
    recordRoundCardView(sessionId, card.id);
  }
}

function insertSpellingAttemptHistory(itemId: string, outcomes: boolean[]): void {
  const db = getDb();
  const prompt = db.prepare("SELECT id FROM spelling_prompts WHERE item_id = ? ORDER BY id ASC LIMIT 1").get(itemId) as
    | { id: string }
    | undefined;
  if (!prompt) throw new Error(`Expected a spelling prompt for ${itemId}`);

  const sessionId = `test_spelling_session_${itemId}_${outcomes.length}`;
  const baseTime = Date.now() - 3_600_000;
  const now = new Date(baseTime).toISOString();
  db.prepare(
    `INSERT INTO spelling_sessions
      (id, learner_id, status, target_item_count, actual_question_count, item_ids_json, started_at, ended_at, summary_json, created_at, updated_at)
     VALUES (?, 'learner_defne', 'completed', 1, 1, ?, ?, ?, '{}', ?, ?)`
  ).run(sessionId, JSON.stringify([itemId]), now, now, now, now);

  outcomes.forEach((isCorrect, index) => {
    const createdAt = new Date(baseTime + index * 60_000).toISOString();
    db.prepare(
      `INSERT INTO spelling_attempts
        (id, session_id, learner_id, item_id, prompt_id, prompt_json, expected_answer_json, submitted_answer, is_correct, response_time_ms, created_at)
       VALUES (?, ?, 'learner_defne', ?, ?, '{}', '{}', ?, ?, 900, ?)`
    ).run(
      `test_spelling_attempt_${itemId}_${index}`,
      sessionId,
      itemId,
      prompt.id,
      isCorrect ? "all_correct" : "word:0",
      isCorrect ? 1 : 0,
      createdAt
    );
  });

  const correctCount = outcomes.filter(Boolean).length;
  const wrongCount = outcomes.length - correctCount;
  const lastCorrectIndex = outcomes.map((value, index) => (value ? index : -1)).filter((index) => index >= 0).at(-1);
  const lastWrongIndex = outcomes.map((value, index) => (!value ? index : -1)).filter((index) => index >= 0).at(-1);
  const lastAttemptAt = new Date(baseTime + (outcomes.length - 1) * 60_000).toISOString();
  const lastCorrectAt =
    lastCorrectIndex === undefined ? null : new Date(baseTime + lastCorrectIndex * 60_000).toISOString();
  const lastWrongAt =
    lastWrongIndex === undefined ? null : new Date(baseTime + lastWrongIndex * 60_000).toISOString();

  db.prepare(
    `INSERT INTO spelling_learner_state
      (id, learner_id, item_id, attempt_count, correct_count, wrong_count,
       last_seen_at, last_correct_at, last_wrong_at, last_practiced_at,
       last_clean_retrieval_at, recovery_debt, last_practiced_session_id,
       last_practiced_interaction_index, created_at, updated_at)
     VALUES (?, 'learner_defne', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(learner_id, item_id) DO UPDATE SET
       attempt_count = excluded.attempt_count,
       correct_count = excluded.correct_count,
       wrong_count = excluded.wrong_count,
       last_seen_at = excluded.last_seen_at,
       last_correct_at = excluded.last_correct_at,
       last_wrong_at = excluded.last_wrong_at,
       last_practiced_at = excluded.last_practiced_at,
       last_clean_retrieval_at = excluded.last_clean_retrieval_at,
       recovery_debt = excluded.recovery_debt,
       last_practiced_session_id = excluded.last_practiced_session_id,
       last_practiced_interaction_index = excluded.last_practiced_interaction_index,
       updated_at = excluded.updated_at`
  ).run(
    `test_spelling_state_${itemId}`,
    itemId,
    outcomes.length,
    correctCount,
    wrongCount,
    lastAttemptAt,
    lastCorrectAt,
    lastWrongAt,
    lastAttemptAt,
    lastCorrectAt,
    Math.max(0, wrongCount - correctCount),
    sessionId,
    outcomes.length,
    now,
    lastAttemptAt
  );
}

function answerCurrentStepCorrectly(sessionId: string, step: "meaning_recognition" | "context_usage"): void {
  let view = getSessionView(sessionId);
  while (view.round?.currentStep === step && view.question) {
    submitSessionAnswer({
      sessionId,
      submittedAnswer: view.question.canonicalAnswer,
      hintLevelUsed: 0,
      responseTimeMs: 900
    });
    view = getSessionView(sessionId);
  }
}
