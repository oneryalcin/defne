import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { recordCardViewAction, startMeaningRecognitionAction } from "@/app/actions";
import { getAttemptReview, getSessionView, type AttemptReview, type RoundLearnCardView, type RoundSessionView } from "@/lib/db/repository";
import { QuestionForm } from "@/components/QuestionForm";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
  searchParams
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ attemptId?: string; card?: string; repair?: string }>;
}) {
  const { sessionId } = await params;
  const { attemptId, card, repair } = await searchParams;

  if (attemptId) {
    const review = getAttemptReview(sessionId, attemptId);
    if (review.isCorrect) {
      redirect(reviewNextHref(review));
    }
    const isRoundReview = Boolean(review.roundStep);
    const percent = review.totalQuestions > 0
      ? Math.min(isRoundReview && !review.isSessionComplete ? 92 : 100, Math.round((review.questionNumber / review.totalQuestions) * 100))
      : 0;

    return (
      <main className="spread">
        <article className="book-page book-page--ruled practice-spread">
          <div className="practice-progress-row">
            <div
              className="progress-track progress-track-compact"
              aria-label={`Progress ${review.questionNumber} of ${review.totalQuestions}`}
            >
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="practice-progress-count">
              {review.questionNumber}/{review.totalQuestions}
            </span>
          </div>
          <ReviewPanel review={review} />
        </article>
      </main>
    );
  }

  const view = getSessionView(sessionId, card);
  // Show the bar including the in-flight question so the question screen
  // matches the review screen (and Q1 isn't a flat empty bar).
  const percent =
    view.totalQuestions > 0
      ? Math.min(
          100,
          Math.round((view.questionNumber / view.totalQuestions) * 100)
        )
      : 0;

  if (view.round?.currentStep === "learn_cards" && view.round.selectedCard) {
    return (
      <main className="page">
        <section className="question-shell question-focus-shell">
          <LearnCardsPanel sessionId={sessionId} round={view.round} card={view.round.selectedCard} />
        </section>
      </main>
    );
  }

  if (view.round?.isRetryPass && view.round.passNumber && repair !== repairPassMarker(view.round)) {
    return (
      <main className="page">
        <RepairPassIntro sessionId={sessionId} round={view.round} percent={percent} />
      </main>
    );
  }

  if (!view.question || !view.word) {
    return (
      <main className="page">
        <section className="mission-panel">
          <h1>Mission complete</h1>
          <p className="section-copy">This session is finished. Review what changed on the summary screen.</p>
          <div className="action-row">
            <Link className="button" href={`/child/session/${sessionId}/summary`}>
              View summary
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="spread">
      <article className="book-page book-page--ruled practice-spread">
        <div className="practice-progress-row">
          <div className="progress-track progress-track-compact" aria-label={`Progress ${view.questionNumber} of ${view.totalQuestions}`}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <span className="practice-progress-count">
            {view.questionNumber}/{view.totalQuestions}
          </span>
        </div>
        <QuestionForm sessionId={sessionId} question={view.question} />
      </article>
    </main>
  );
}

function RepairPassIntro({ sessionId, round, percent }: { sessionId: string; round: RoundSessionView; percent: number }) {
  const cardsById = new Map(round.cards.map((card) => [card.id, card]));
  const repairCards = round.currentPassWordIds
    .map((wordId) => cardsById.get(wordId))
    .filter((card): card is RoundLearnCardView => Boolean(card));
  const passLabel = `${roundStepLabel(round.currentStep)} · pass ${round.passNumber ?? 2}`;
  const questionCopy = round.remainingInPass === 1 ? "1 question" : `${round.remainingInPass} questions`;

  return (
    <section className="question-shell question-focus-shell repair-intro-shell">
      <div className="question-main">
        <div className="progress-track progress-track-compact" aria-label={`${passLabel} quick practice preview`}>
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <h1>A few words are ready for another go.</h1>
        <p>
          You have already seen these words. Try them once more, then we will keep going.
        </p>

        <div className="repair-intro-card">
          <div>
            <span className="metric-label">Next up</span>
            <strong>{questionCopy}</strong>
          </div>
          <ul className="repair-word-list" aria-label="Words in this quick practice">
            {repairCards.map((card) => (
              <li key={card.id}>
                <strong>{card.word}</strong>
                <span>Seen already</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="action-row">
          <Link className="button button-large" href={`/child/session/${sessionId}?repair=${encodeURIComponent(repairPassMarker(round))}`}>
            Start
          </Link>
        </div>
      </div>
    </section>
  );
}

function LearnCardsPanel({ sessionId, round, card }: { sessionId: string; round: RoundSessionView; card: RoundLearnCardView }) {
  const unreadyOthers = round.cards.filter(
    (item) => item.id !== card.id && item.viewCount < 2
  );
  // Pick a random unready card next so two cards do not ping-pong each other.
  const nextUnreadyCard =
    unreadyOthers.length > 0
      ? unreadyOthers[Math.floor(Math.random() * unreadyOthers.length)]
      : null;
  const otherCards = round.cards.filter((item) => item.id !== card.id);
  const fallbackCard =
    otherCards.length > 0
      ? otherCards[Math.floor(Math.random() * otherCards.length)]
      : null;
  const returnToWordId = nextUnreadyCard?.id ?? fallbackCard?.id ?? card.id;
  const readyCount = round.cards.filter((item) => item.viewCount >= 2).length;
  const cardIsReady = card.viewCount >= 2;

  return (
    <div>
      <div className="progress-track" aria-label="Learn card progress">
        <div
          className="progress-fill"
          style={{ width: `${Math.round((readyCount / round.wordCount) * 100)}%` }}
        />
      </div>

      <div className="learn-card">
        <div className="learn-card-header">
          <div className="learn-card-title-row">
            <h1>
              {card.selectionReason ? (
                <ReasonWord
                  word={card.word}
                  reason={card.selectionReason}
                  history={card.history}
                  colour={card.history.masteryColour}
                />
              ) : (
                card.word
              )}
            </h1>
          </div>
          <p className="learn-card__meaning">
            <em>{card.definition}</em>
          </p>
        </div>

        <CardSupport card={card} />

        <div className="learn-card-actions">
          {round.canUnlockMeaning ? (
            <form action={startMeaningRecognitionAction}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <button className="ribbon" type="submit">
                Start matching <ArrowRight size={18} aria-hidden="true" />
              </button>
            </form>
          ) : cardIsReady && nextUnreadyCard ? (
            <Link
              className="ribbon"
              href={`/child/session/${sessionId}?card=${nextUnreadyCard.id}`}
            >
              Next card <ArrowRight size={18} aria-hidden="true" />
            </Link>
          ) : (
            <CardViewForm sessionId={sessionId} wordId={card.id} returnToWordId={returnToWordId} />
          )}
        </div>
      </div>
    </div>
  );
}

function CardViewForm({
  sessionId,
  wordId,
  returnToWordId
}: {
  sessionId: string;
  wordId: string;
  returnToWordId: string;
}) {
  return (
    <form action={recordCardViewAction}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="wordId" value={wordId} />
      <input type="hidden" name="returnToWordId" value={returnToWordId} />
      <button className="ribbon" type="submit">
        Reviewed <ArrowRight size={18} aria-hidden="true" />
      </button>
    </form>
  );
}

function CardSupport({ card }: { card: RoundLearnCardView }) {
  return (
    <div className="card-support-grid">
      {card.synonyms.length > 0 ? (
        <div>
          <span className="metric-label">Synonyms</span>
          <p>{card.synonyms.join(", ")}</p>
        </div>
      ) : null}
      {card.antonyms.length > 0 ? (
        <div>
          <span className="metric-label">Antonym</span>
          <p>{card.antonyms.join(", ")}</p>
        </div>
      ) : null}
      <div className="card-support-example">
        <span className="metric-label">Example</span>
        <blockquote>{card.example}</blockquote>
      </div>
    </div>
  );
}

function ReasonWord({
  word,
  reason,
  history,
  colour,
}: {
  word: string;
  reason: NonNullable<RoundLearnCardView["selectionReason"]>;
  history: RoundLearnCardView["history"];
  colour: RoundLearnCardView["history"]["masteryColour"];
}) {
  const stats =
    history.attemptCount > 0
      ? `Seen ${history.attemptCount} time${history.attemptCount === 1 ? "" : "s"} · ✓ ${history.correctCount} · ✗ ${history.wrongCount}`
      : "Not started yet — first time on the page.";
  const tone = reason.reason === "near_review" ? "red" : colour ?? "untracked";
  return (
    <span
      className={`reason-word reason-word--${tone}`}
      tabIndex={0}
      role="button"
      aria-label={`Practice reason: ${reason.label}`}
    >
      {word}
      <span className="reason-pill__pop" role="tooltip">
        <strong>{reason.label}</strong>
        <span className="reason-pill__detail">{reason.detail}</span>
        <span className="reason-pill__stats">{stats}</span>
      </span>
    </span>
  );
}

function RoundAside({ sessionId, round }: { sessionId: string; round: RoundSessionView }) {
  return (
    <aside className="helper-panel" aria-label="Round words">
      <div className="round-status-card">
        <strong>{round.canUnlockMeaning ? "Ready for Step 2" : "Step 1"}</strong>
        <span>
          {round.canUnlockMeaning
            ? "Every card has two reviews. The next task is matching each word to its meaning."
            : "Each card needs two reviews. The list stays here if you want to revisit a word."}
        </span>
      </div>
      <ul className="round-card-list">
        {round.cards.map((card) => (
          <li key={card.id}>
            <span>
              <Link href={`/child/session/${sessionId}?card=${card.id}`}>{card.word}</Link>
              {card.selectionReason ? <small>{card.selectionReason.label}</small> : null}
            </span>
            <strong>{card.viewCount >= 2 ? "ready" : `${card.viewCount}/2`}</strong>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ReviewPanel({ review }: { review: AttemptReview }) {
  const nextHref = reviewNextHref(review);
  const choicesShowCorrection = review.choices.length > 0;

  // Mirror the question screen exactly: instruction, then either the
  // big italic word (most types) or the story-sentence with a blank
  // (fill_sentence — never reveal the answer in the prompt).
  const isFill = review.questionType === "fill_sentence";
  const fillPassage = isFill ? splitFillPrompt(review.prompt) : null;
  return (
    <div className="result-panel">
      <p className="practice-instruction">{review.instruction}</p>
      {isFill ? (
        fillPassage ? (
          <blockquote className="story-sentence">
            {fillPassage.before}
            <span className="target target--filled" aria-label={`Answer: ${review.canonicalAnswer}`}>
              {review.canonicalAnswer}
            </span>
            {fillPassage.after}
          </blockquote>
        ) : (
          <p className="practice-instruction">{review.prompt}</p>
        )
      ) : (
        <>
          <h2 className="practice-word">{review.targetWord}</h2>
          <p
            className="practice-instruction"
            style={{ marginTop: 8, color: "var(--steel-secondary)" }}
          >
            {review.prompt}
          </p>
        </>
      )}

      {review.choices.length > 0 ? (
        <div className="choice-grid" aria-label="Answer choices">
          {review.choices.map((choice) => {
            const isSubmitted = normalise(choice) === normalise(review.submittedAnswer);
            const isExpected = normalise(choice) === normalise(review.canonicalAnswer);
            const className = [
              "choice",
              "choice-review",
              isExpected ? "choice-correct" : "",
              isSubmitted && !review.isCorrect ? "choice-submitted-wrong" : ""
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div className={className} key={choice}>
                <span>{choice}</span>
                {!review.isCorrect && isExpected ? <strong>Expected</strong> : null}
                {!review.isCorrect && isSubmitted && !isExpected ? <strong>Your answer</strong> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {!review.isCorrect && shouldShowMeaningNote(review) ? (
        <WordMeaningNote review={review} />
      ) : null}

      {review.revealAndMoveOn ? (
        <div className="result-callout result-recovery">
          <strong>Answer revealed so the round can keep moving.</strong>
          <span>This word will come back soon instead of blocking the round.</span>
          {!choicesShowCorrection ? <CanonicalAnswer answer={review.canonicalAnswer} /> : null}
        </div>
      ) : null}

      <div className="action-row">
        <Link className="button" href={nextHref}>
          {review.isSessionComplete ? "See summary" : "Next"}
        </Link>
      </div>
    </div>
  );
}

function shouldShowMeaningNote(review: AttemptReview): boolean {
  return Boolean(review.targetDefinition) && review.questionType !== "definition_choice";
}

function WordMeaningNote({ review }: { review: AttemptReview }) {
  return (
    <section className="meaning-note" aria-label="Word meaning">
      <div className="meaning-note__item meaning-note__item--expected">
        <span>Remember</span>
        <p>
          <strong>{review.targetWord}</strong> means {review.targetDefinition}.
        </p>
      </div>
      {review.submittedWordDefinition ? (
        <div className="meaning-note__item meaning-note__item--submitted">
          <span>Your answer</span>
          <p>
            <strong>{review.submittedWordDefinition.word}</strong> means {review.submittedWordDefinition.definition}.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function CanonicalAnswer({ answer }: { answer: string }) {
  return (
    <div className="canonical-answer">
      <span>Expected answer</span>
      <strong>{answer}</strong>
    </div>
  );
}

function splitFillPrompt(
  prompt: string
): { before: string; after: string } | null {
  const blank = "_____";
  const idx = prompt.indexOf(blank);
  if (idx === -1) return null;
  return {
    before: prompt.slice(0, idx),
    after: prompt.slice(idx + blank.length),
  };
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

function reviewNextHref(review: AttemptReview): string {
  if (review.isSessionComplete) return `/child/session/${review.sessionId}/summary`;
  if (review.roundStep && review.passNumber && review.passNumber > 1) {
    return `/child/session/${review.sessionId}?repair=${encodeURIComponent(repairPassMarkerFromParts(review.roundStep, review.passNumber))}`;
  }
  return `/child/session/${review.sessionId}`;
}

function repairPassMarker(round: RoundSessionView): string {
  return repairPassMarkerFromParts(round.currentStep, round.passNumber ?? 1);
}

function repairPassMarkerFromParts(step: RoundSessionView["currentStep"] | NonNullable<AttemptReview["roundStep"]>, passNumber: number): string {
  return `${step}-${passNumber}`;
}

function roundStepLabel(step: RoundSessionView["currentStep"] | AttemptReview["roundStep"]): string {
  if (step === "meaning_recognition") return "Meaning recognition";
  if (step === "context_usage") return "Context usage";
  if (step === "learn_cards") return "Learn cards";
  if (step === "spelling_production") return "Spelling";
  return "Round";
}
