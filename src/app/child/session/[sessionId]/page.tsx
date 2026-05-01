import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { recordCardViewAction, startMeaningRecognitionAction } from "@/app/actions";
import { getAttemptReview, getSessionView, type AttemptReview, type RoundLearnCardView, type RoundSessionView } from "@/lib/db/repository";
import type { FailureType } from "@/lib/types";
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
    const isRoundReview = Boolean(review.roundStep);
    const percent = review.totalQuestions > 0
      ? Math.min(isRoundReview && !review.isSessionComplete ? 92 : 100, Math.round((review.questionNumber / review.totalQuestions) * 100))
      : 0;
    const progressLabel = isRoundReview
      ? `${roundStepLabel(review.roundStep)} · pass ${review.passNumber ?? 1} review`
      : `Question ${review.questionNumber} of ${review.totalQuestions}`;

    const today = new Date().toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    return (
      <main className="spread">
        <article className="book-page book-page--ruled practice-spread">
          <span className="folio">
            Question {review.questionNumber} / {review.totalQuestions}
          </span>
          <header className="practice-crumbs">
            <span>Round · {today}</span>
            <span className="dotline" aria-hidden="true" />
            <span>{review.questionNumber} of {review.totalQuestions}</span>
          </header>
          <div
            className="progress-track progress-track-compact"
            aria-label={isRoundReview ? `${progressLabel}, question ${review.questionNumber} so far` : progressLabel}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="metric-label">{progressLabel}</p>
          <ReviewPanel review={review} />
        </article>
      </main>
    );
  }

  const view = getSessionView(sessionId, card);
  const percent = view.totalQuestions > 0 ? Math.min(100, Math.round(((view.questionNumber - 1) / view.totalQuestions) * 100)) : 0;

  if (view.round?.currentStep === "learn_cards" && view.round.selectedCard) {
    return (
      <main className="page">
        <section className="question-shell">
          <LearnCardsPanel sessionId={sessionId} round={view.round} card={view.round.selectedCard} />
          <RoundAside sessionId={sessionId} round={view.round} />
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

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const passLabel = view.round?.isRetryPass
    ? `Repair pass · ${view.round.remainingInPass} left`
    : view.round
    ? `First pass · ${view.round.remainingInPass} left`
    : null;

  return (
    <main className="spread">
      <article className="book-page book-page--ruled practice-spread">
        <span className="folio">
          Question {view.questionNumber} / {view.totalQuestions}
        </span>
        <header className="practice-crumbs">
          <span>Round · {today}</span>
          <span className="dotline" aria-hidden="true" />
          <span>{view.questionNumber} of {view.totalQuestions}</span>
        </header>
        <div className="progress-track progress-track-compact" aria-label={view.round?.stepProgressLabel ?? `Question ${view.questionNumber} of ${view.totalQuestions}`}>
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        {passLabel ? (
          <div className="question-meta-row">
            <span className="metric-label">
              {view.round?.stepProgressLabel ?? `Question ${view.questionNumber} of ${view.totalQuestions}`}
            </span>
            <span className={`pass-pill ${view.round?.isRetryPass ? "repair-pass-pill" : "first-pass-pill"}`}>
              {passLabel}
            </span>
          </div>
        ) : null}
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
        <div className="progress-track progress-track-compact" aria-label={`${passLabel} repair preview`}>
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="repair-intro-kicker">
          <span className="pass-pill repair-pass-pill">Repair pass</span>
          <span>{passLabel}</span>
        </div>
        <h1>Let&apos;s work on the words that need one more try.</h1>
        <p>
          The first pass found a smaller set to practice. This is not starting over; these are the words that need a
          clean comeback before the round moves on.
        </p>

        <div className="repair-intro-card">
          <div>
            <span className="metric-label">Coming up</span>
            <strong>{questionCopy}</strong>
          </div>
          <ul className="repair-word-list" aria-label="Words in this repair pass">
            {repairCards.map((card) => (
              <li key={card.id}>
                <strong>{card.word}</strong>
                {card.selectionReason ? <span>{card.selectionReason.label}</span> : null}
              </li>
            ))}
          </ul>
        </div>

        <div className="action-row">
          <Link className="button button-large" href={`/child/session/${sessionId}?repair=${encodeURIComponent(repairPassMarker(round))}`}>
            Start the repair pass
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
      <p className="metric-label">
        Learn cards · {readyCount} / {round.wordCount} ready · card {card.viewCount} / 2 reviews
      </p>

      <div className="learn-card">
        <div className="learn-card-header">
          <div className="learn-card-title-row">
            <h1>{card.word}</h1>
            {card.selectionReason ? (
              <ReasonPill
                reason={card.selectionReason}
                history={card.history}
                colour={card.history.masteryColour}
              />
            ) : null}
          </div>
          <p className="learn-card__meaning">
            <em>{card.definition}</em>
          </p>
          {round.canUnlockMeaning ? (
            <p>All cards are ready. Start the matching step when this word feels clear.</p>
          ) : cardIsReady ? (
            <p>This card is ready. Move to the next card that still needs a review.</p>
          ) : null}
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
      <div>
        <span className="metric-label">Example</span>
        <p>{card.example}</p>
      </div>
      {card.synonyms.length > 0 ? (
        <div>
          <span className="metric-label">Near words</span>
          <p>{card.synonyms.join(", ")}</p>
        </div>
      ) : null}
      {card.antonyms.length > 0 ? (
        <div>
          <span className="metric-label">Contrast</span>
          <p>{card.antonyms.join(", ")}</p>
        </div>
      ) : null}
      {card.confusables.length > 0 ? (
        <div>
          <span className="metric-label">Careful with</span>
          <p>{card.confusables.join(", ")}</p>
        </div>
      ) : null}
    </div>
  );
}

function ReasonPill({
  reason,
  history,
  colour,
}: {
  reason: NonNullable<RoundLearnCardView["selectionReason"]>;
  history: RoundLearnCardView["history"];
  colour: RoundLearnCardView["history"]["masteryColour"];
}) {
  const stats =
    history.attemptCount > 0
      ? `Seen ${history.attemptCount} time${history.attemptCount === 1 ? "" : "s"} · ✓ ${history.correctCount} · ✗ ${history.wrongCount}`
      : "Not started yet — first time on the page.";
  const tone = colour ?? "untracked";
  return (
    <span
      className={`reason-pill reason-pill--${tone}`}
      tabIndex={0}
      role="button"
      aria-label={`Practice reason: ${reason.label}`}
    >
      <span className="reason-pill__dot" aria-hidden="true" />
      {reason.label}
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
  const showRecoveryExplanation = review.isCorrect && review.firstAttemptCorrect === false;
  const choicesShowCorrection = review.choices.length > 0;

  return (
    <div className="result-panel">
      <p className="question-prompt">{review.prompt}</p>
      <p className="question-instruction">{review.instruction}</p>

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

      {showRecoveryExplanation ? (
        <div className="result-callout result-correct">
          <strong>Fixed now.</strong>
          <span>This item is done for this step. It will still come back soon because the first try was missed.</span>
        </div>
      ) : review.revealAndMoveOn ? (
        <div className="result-callout result-recovery">
          <strong>Answer revealed so the round can keep moving.</strong>
          <span>This word will come back soon instead of blocking the round.</span>
          {!choicesShowCorrection ? <CanonicalAnswer answer={review.canonicalAnswer} /> : null}
        </div>
      ) : !review.isCorrect ? (
        <RecoveryCallout review={review} choicesShowCorrection={choicesShowCorrection} />
      ) : null}

      <div className="action-row">
        <Link className="button" href={nextHref}>
          {review.isSessionComplete ? "See summary" : "Next"}
        </Link>
      </div>
    </div>
  );
}

function RecoveryCallout({ review, choicesShowCorrection }: { review: AttemptReview; choicesShowCorrection: boolean }) {
  if (review.failureType === "spelling_error") {
    return (
      <div className="result-callout result-recovery">
        <strong>Let&apos;s fix the spelling.</strong>
        <span>This word will come back so the correct spelling has another chance to stick.</span>
        {choicesShowCorrection ? null : <SpellingDiff submitted={review.submittedAnswer} canonical={review.canonicalAnswer} />}
      </div>
    );
  }

  return (
    <div className="result-callout result-recovery">
      <strong>{recoveryTitle(review.failureType)}</strong>
      <span>{recoveryCopy(review.failureType)}</span>
      {!choicesShowCorrection ? <CanonicalAnswer answer={review.canonicalAnswer} /> : null}
    </div>
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

function SpellingDiff({ submitted, canonical }: { submitted: string; canonical: string }) {
  const submittedChars = submitted.trim().split("");
  const canonicalChars = canonical.trim().split("");
  const maxLength = Math.max(submittedChars.length, canonicalChars.length);

  return (
    <div className="spelling-diff" aria-label="Spelling comparison">
      <div>
        <span>Typed</span>
        <strong>
          {Array.from({ length: maxLength }, (_, index) => (
            <mark
              className={submittedChars[index] === canonicalChars[index] ? "letter-ok" : "letter-miss"}
              key={`submitted-${index}`}
            >
              {submittedChars[index] ?? "·"}
            </mark>
          ))}
        </strong>
      </div>
      <div>
        <span>Correct</span>
        <strong>
          {Array.from({ length: maxLength }, (_, index) => (
            <mark
              className={submittedChars[index] === canonicalChars[index] ? "letter-ok" : "letter-fix"}
              key={`canonical-${index}`}
            >
              {canonicalChars[index] ?? "·"}
            </mark>
          ))}
        </strong>
      </div>
    </div>
  );
}

function recoveryTitle(failureType: FailureType): string {
  if (failureType === "confused_with_similar_word") return "Let's separate the close words.";
  if (failureType === "recognised_but_could_not_produce") return "You recognised the idea; production needs another pass.";
  return "Let's look closer.";
}

function recoveryCopy(failureType: FailureType): string {
  if (failureType === "confused_with_similar_word") {
    return "The answer was close enough to be tempting, so this word should return with a clearer contrast.";
  }
  if (failureType === "recognised_but_could_not_produce") {
    return "Seeing it and producing it are different skills. We will revisit this without making it feel punitive.";
  }
  return "Compare the highlighted answers. This word will come back in the repair pass.";
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
