import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./index";
import { seedInitialData } from "./seed";
import {
  createOrUpdateParentWord,
  findActiveWordByText,
  getMissionPreview,
  getSessionSummary,
  getSessionView,
  recordRoundCardView,
  startRoundMeaningRecognition,
  startRoundMission,
  submitSessionAnswer,
  upsertParentExampleVisualCues
} from "./repository";
import {
  createOrUpdateParentSpellingItem,
  getParentSpellingItemForEdit,
  getParentSpellingItems,
  getSpellingPreview,
  getSpellingSessionView,
  startSpellingPractice,
  startSpellingMission,
  submitSpellingAnswer
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

  it("finds active words by normalized text before generation", () => {
    createOrUpdateParentWord({
      word: "Brisk",
      definition: "Quick and energetic.",
      example: "Mina walked at a brisk pace and reached the gate before the bell."
    });

    expect(findActiveWordByText("  brisk  ")?.word).toBe("Brisk");
    expect(findActiveWordByText("briskly")).toBeNull();
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

    const preview = getSpellingPreview(20);
    expect(preview.items.some((item) => item.target === "practise")).toBe(true);
    expect(preview.items.some((item) => item.target === "practice")).toBe(false);
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
    expect(practice.question?.displayedSentence).toContain(preview.items[0].target);
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
