import Link from "next/link";
import { ArrowRight, Check, X } from "lucide-react";
import { startSpellingPracticeAction, submitSpellingAnswerAction } from "@/app/actions";
import { getSpellingSessionView } from "@/lib/db/spellingRepository";
import type { SpellingQuestion, SpellingSentenceToken } from "@/lib/learning/spelling";

export const dynamic = "force-dynamic";

export default async function SpellingSessionPage({
  params,
  searchParams
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ attemptId?: string; complete?: string }>;
}) {
  const { sessionId } = await params;
  const { attemptId, complete } = await searchParams;
  const view = getSpellingSessionView(sessionId, attemptId);

  if (view.phase === "intro") {
    return (
      <main className="spread">
        <article className="book-page book-page--ruled practice-spread" aria-labelledby="spelling-study-title">
          <div className="practice-flow">
            <div className="spelling-study-head">
              <span className="cover-chapter">Spelling study</span>
              <h1 id="spelling-study-title">Learn the contrasts.</h1>
              <p>Read each pair as a choice: what job does the word do, and which sentence does it fit?</p>
            </div>

            <div className="spelling-study-grid">
              {view.studyGroups.map((group) => (
                <section className="spelling-study-group" key={group.id} aria-labelledby={`study-${group.id}`}>
                  <header className="spelling-study-group__head">
                    <span>{group.items.length > 1 ? "Do not mix up" : "Use this word"}</span>
                    <h2 id={`study-${group.id}`}>{group.title}</h2>
                  </header>
                  <div className="spelling-study-group__items">
                    {group.items.map((item) => (
                      <article className="spelling-study-card" key={item.id}>
                        <div className="spelling-study-card__top">
                          <h3>{item.target}</h3>
                          {item.usageLabel ? <span>{item.usageLabel}</span> : null}
                        </div>
                        <p>{item.teachingNote}</p>
                        <blockquote>{item.example}</blockquote>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <form action={startSpellingPracticeAction}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <footer className="page-actions">
                <button className="ribbon" type="submit">
                  Start spelling <ArrowRight size={18} aria-hidden="true" />
                </button>
              </footer>
            </form>
          </div>
        </article>
      </main>
    );
  }

  if (!view.question || complete === "1" || (view.status === "completed" && !view.lastResult)) {
    return (
      <main className="spread">
        <article className="book-page end-spread" aria-labelledby="spelling-end-title">
          <h1 id="spelling-end-title" className="end-headline">Spelling done.</h1>
          {view.lastResult ? <SpellingResult result={view.lastResult} /> : null}
          <footer className="page-actions">
            <div className="end-actions">
              <Link className="ribbon" href="/child/spelling">
                Open another spelling path
              </Link>
              <Link className="ribbon ribbon--ghost" href="/child">
                Child home
              </Link>
            </div>
          </footer>
        </article>
      </main>
    );
  }
  const question = view.question;
  const solvedCurrentQuestion = view.lastResult?.isCorrect === true;

  return (
    <main className="spread">
      <article className="book-page book-page--ruled practice-spread">
        <div className="practice-flow">
          <div className="practice-progress-row">
            <div
              className="progress-track progress-track-compact"
              aria-label={`Progress ${view.questionNumber} of ${view.totalQuestions}`}
            >
              <div
                className="progress-fill"
                style={{ width: `${Math.round((view.questionNumber / view.totalQuestions) * 100)}%` }}
              />
            </div>
            <span className="practice-progress-count">
              {view.questionNumber}/{view.totalQuestions}
            </span>
          </div>

          {view.lastResult ? <SpellingResult result={view.lastResult} /> : null}

          <form action={submitSpellingAnswerAction} className="spelling-question">
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="responseTimeMs" value="0" />
            <p className="practice-instruction">
              Find one spelling mistake, or choose all correct.
            </p>
            <SpellingSentence question={question} result={view.lastResult} disabled={solvedCurrentQuestion} />
            <footer className="page-actions">
              {solvedCurrentQuestion ? (
                <Link
                  className="ribbon"
                  href={
                    view.lastResult?.completed
                      ? `/child/spelling/session/${sessionId}?complete=1`
                      : `/child/spelling/session/${sessionId}`
                  }
                >
                  {view.lastResult?.completed ? "Finish" : "Next sentence"} <ArrowRight size={18} aria-hidden="true" />
                </Link>
              ) : (
                <button className="ribbon ribbon--ghost" type="submit" name="answer" value="all_correct">
                  All correct
                </button>
              )}
            </footer>
          </form>
        </div>
      </article>
    </main>
  );
}

function SpellingSentence({
  question,
  result,
  disabled
}: {
  question: SpellingQuestion;
  result: {
    isCorrect: boolean;
    selectedTokenIndex: number | null;
    correctTokenIndex: number | null;
  } | null;
  disabled: boolean;
}) {
  return (
    <blockquote className="story-sentence spelling-sentence" aria-label="Spelling sentence">
      {question.tokens.map((token) =>
        token.isWord ? (
          <button
            className={spellingTokenClass(token, result)}
            key={token.index}
            type="submit"
            name="answer"
            value={`word:${token.index}`}
            disabled={disabled}
          >
            {token.text}
            {result?.isCorrect && result.correctTokenIndex === token.index && question.correctWord !== token.text ? (
              <small>{question.correctWord}</small>
            ) : null}
          </button>
        ) : (
          <span key={token.index}>{token.text}</span>
        )
      )}
    </blockquote>
  );
}

function spellingTokenClass(
  token: SpellingSentenceToken,
  result: {
    isCorrect: boolean;
    selectedTokenIndex: number | null;
    correctTokenIndex: number | null;
  } | null
): string {
  const classes = ["spelling-word-button"];
  if (result?.isCorrect && result.correctTokenIndex === token.index) classes.push("is-found");
  if (!result?.isCorrect && result?.selectedTokenIndex === token.index) classes.push("is-wrong-selection");
  return classes.join(" ");
}

function SpellingResult({
  result
}: {
  result: {
    isCorrect: boolean;
    submittedAnswer: string;
    correctAnswer: string;
    question: SpellingQuestion;
  };
}) {
  return (
    <section className={result.isCorrect ? "spelling-result is-correct" : "spelling-result is-wrong"}>
      {result.isCorrect ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
      <span>
        <strong>{result.isCorrect ? "Found it" : "Try that sentence again"}</strong>
        {result.isCorrect && result.question.issueKind !== "none" ? (
          <small>
            {result.question.displayedWord} should be {result.correctAnswer}.
          </small>
        ) : null}
        {result.isCorrect && result.question.issueKind === "none" ? <small>Every word was spelled correctly.</small> : null}
        {!result.isCorrect ? <small>That choice is not the spelling mistake.</small> : null}
      </span>
    </section>
  );
}
