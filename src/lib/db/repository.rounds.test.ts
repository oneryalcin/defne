import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "./index";
import {
  getMissionPreview,
  getSessionSummary,
  getSessionView,
  recordRoundCardView,
  startRoundMeaningRecognition,
  startRoundMission,
  submitSessionAnswer
} from "./repository";

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
  it("previews the same round words that starting the round creates", () => {
    const preview = getMissionPreview(6);
    const sessionId = startRoundMission(6);
    const view = getSessionView(sessionId);

    expect(view.round?.cards.map((card) => card.id)).toEqual(preview.words.map((word) => word.id));
    expect(preview.words.map((word) => word.selectionReason.reason)).toEqual(
      view.round?.cards.map((card) => card.selectionReason?.reason)
    );
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

  it("prioritizes near-review words in later rounds until six clean eligible questions clear them", () => {
    const revealedWord = completeRoundWithFirstContextWordRevealed();

    for (let cleanRoundIndex = 0; cleanRoundIndex < 3; cleanRoundIndex += 1) {
      const sessionId = startRoundMission(6);
      let view = getSessionView(sessionId);
      expect(view.round?.cards[0]?.word).toBe(revealedWord);
      expect(view.round?.cards[0]?.selectionReason?.reason).toBe("near_review");

      completeLearnCards(sessionId);
      startRoundMeaningRecognition(sessionId);
      answerCurrentStepCorrectly(sessionId, "meaning_recognition");
      answerCurrentStepCorrectly(sessionId, "context_usage");
    }

    const row = getDb()
      .prepare(
        `SELECT s.near_review, s.eligible_questions_since_last_mistake
         FROM learner_word_state s
         JOIN words w ON w.id = s.word_id
         WHERE w.word = ?`
      )
      .get(revealedWord) as { near_review: number; eligible_questions_since_last_mistake: number };

    expect(row.eligible_questions_since_last_mistake).toBe(6);
    expect(row.near_review).toBe(0);
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
