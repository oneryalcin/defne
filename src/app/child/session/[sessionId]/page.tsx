import Image from "next/image";
import Link from "next/link";
import { recordCardViewAction, startMeaningRecognitionAction } from "@/app/actions";
import { getAttemptReview, getSessionView, type AttemptReview, type RoundLearnCardView, type RoundSessionView } from "@/lib/db/repository";
import type { FailureType } from "@/lib/types";
import { QuestionForm } from "@/components/QuestionForm";
import { MasteryBadge } from "@/components/MasteryBadge";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
  searchParams
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ attemptId?: string; card?: string }>;
}) {
  const { sessionId } = await params;
  const { attemptId, card } = await searchParams;

  if (attemptId) {
    const review = getAttemptReview(sessionId, attemptId);
    const isRoundReview = Boolean(review.roundStep);
    const percent = review.totalQuestions > 0
      ? Math.min(isRoundReview && !review.isSessionComplete ? 92 : 100, Math.round((review.questionNumber / review.totalQuestions) * 100))
      : 0;
    const progressLabel = isRoundReview
      ? `${roundStepLabel(review.roundStep)} · pass ${review.passNumber ?? 1} review`
      : `Question ${review.questionNumber} of ${review.totalQuestions}`;

    return (
      <main className="page">
        <section className="question-shell">
          <div>
            <div
              className="progress-track"
              aria-label={isRoundReview ? `${progressLabel}, question ${review.questionNumber} so far` : progressLabel}
            >
              <div className="progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <p className="metric-label">{progressLabel}</p>
            {isRoundReview ? <p className="progress-subcopy">Question {review.questionNumber} so far. Retry questions are added only for missed words.</p> : null}
            <ReviewPanel review={review} />
          </div>

          <aside className="helper-panel" aria-label="Attempt review">
            <div className="review-sidecar">
              <p className="metric-label">Your answer</p>
              <strong>{review.submittedAnswer || "No answer entered"}</strong>
              <p className="metric-label">Expected answer</p>
              <strong>{review.canonicalAnswer}</strong>
            </div>
            <HintReview hints={review.hints} openedCount={review.hintLevelUsed} />
            {review.spellingNote ? <div className="hint-box">Spelling note: {review.spellingNote}</div> : null}
          </aside>
        </section>
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
    <main className="page">
      <section className="question-shell">
        <div>
          <div
            className="progress-track"
            aria-label={view.round ? `${view.round.stepProgressLabel}, question ${view.questionNumber} so far` : `Question ${view.questionNumber} of ${view.totalQuestions}`}
          >
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="metric-label">
            {view.round ? view.round.stepProgressLabel : `Question ${view.questionNumber} of ${view.totalQuestions}`}
          </p>
          {view.round ? <p className="progress-subcopy">Question {view.questionNumber} so far. Missed words come back in a repair pass.</p> : null}
          <QuestionForm sessionId={sessionId} question={view.question} />
        </div>

        <aside className="helper-panel" aria-label="Word learning state">
          <Image
            src="/assets/visual-concepts/04-visual-memory-story.png"
            alt="Pencil drawing visual memory story concept"
            width={1536}
            height={1024}
            priority
          />
          <div className="action-row">
            <MasteryBadge colour={view.word.state.masteryColour} />
          </div>
          <div className="dimension-stack">
            <DimensionBar label="Meaning" value={view.word.state.meaningMastery} />
            <DimensionBar label="Usage" value={view.word.state.usageMastery} />
            <DimensionBar label="Spelling" value={view.word.state.spellingMastery} />
          </div>
          {view.word.spellingNote ? <div className="hint-box">Spelling support appears after your answer.</div> : null}
          {view.round ? (
            <div className={`round-status-card ${view.round.isRetryPass ? "repair-pass-card" : "first-pass-card"}`}>
              <strong>{view.round.isRetryPass ? "Repair pass" : "First pass"}</strong>
              <span>
                {view.round.isRetryPass
                  ? `Only missed words are back now. ${view.round.remainingInPass} left in this repair pass.`
                  : `Try each word once. Missed words come back after this pass. ${view.round.remainingInPass} left.`}
              </span>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}

function LearnCardsPanel({ sessionId, round, card }: { sessionId: string; round: RoundSessionView; card: RoundLearnCardView }) {
  const currentIndex = Math.max(0, round.cards.findIndex((item) => item.id === card.id));
  const nextUnreadyCard = round.cards.find((item) => item.id !== card.id && item.viewCount < 2);
  const nextCard = round.cards[(currentIndex + 1) % round.cards.length];
  const returnToWordId = nextUnreadyCard?.id ?? nextCard?.id ?? card.id;
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
      <p className="metric-label">Learn cards · {readyCount} of {round.wordCount} ready</p>

      <div className="learn-card">
        <div className="learn-card-header">
          <span className="metric-label">{card.viewCount >= 2 ? `${card.viewCount} reviews · ready` : `${card.viewCount} of 2 reviews`}</span>
          <h1>{card.word}</h1>
          <p>
            {round.canUnlockMeaning
              ? "All cards are ready. Start the matching step when this word feels clear."
              : cardIsReady
                ? "This card is ready. Move to the next card that still needs a review."
                : "Read the meaning and example, say one sentence with this word, then continue."}
          </p>
          {card.selectionReason ? (
            <div className="selection-reason">
              <span>Practice reason</span>
              <strong>{card.selectionReason.label}</strong>
              <p>{card.selectionReason.detail}</p>
            </div>
          ) : null}
        </div>

        <CardSupport card={card} />

        <div className="learn-card-actions">
          {round.canUnlockMeaning ? (
            <form action={startMeaningRecognitionAction}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <button className="button button-large" type="submit">
                Start matching meanings
              </button>
            </form>
          ) : cardIsReady && nextUnreadyCard ? (
            <Link className="button button-large" href={`/child/session/${sessionId}?card=${nextUnreadyCard.id}`}>
              Go to next card
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
      <button className="button button-large" type="submit">
        Mark reviewed and continue
      </button>
    </form>
  );
}

function CardSupport({ card }: { card: RoundLearnCardView }) {
  return (
    <div className="card-support-grid">
      <div>
        <span className="metric-label">Meaning</span>
        <p>{card.definition}</p>
      </div>
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
      {card.spellingNote ? (
        <div>
          <span className="metric-label">Spelling note</span>
          <p>{card.spellingNote}</p>
        </div>
      ) : null}
    </div>
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
  const nextHref = review.isSessionComplete ? `/child/session/${review.sessionId}/summary` : `/child/session/${review.sessionId}`;

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
                {isExpected ? <strong>Expected</strong> : null}
                {isSubmitted && !isExpected ? <strong>Your answer</strong> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {review.isCorrect ? (
        <div className="result-callout result-correct">
          <strong>{review.firstAttemptCorrect === false ? "Fixed now." : "Good retrieval."}</strong>
          <span>
            {review.firstAttemptCorrect === false
              ? "This item is done for this step. It will still come back soon because the first try was missed."
              : review.hintLevelUsed > 0
                ? "You got there with support, so this still counts as practice."
                : "You recalled it without a hint."}
          </span>
        </div>
      ) : review.revealAndMoveOn ? (
        <div className="result-callout result-recovery">
          <strong>Answer revealed so the round can keep moving.</strong>
          <span>This word will come back soon instead of blocking the round.</span>
          <div className="canonical-answer">
            <span>Expected answer</span>
            <strong>{review.canonicalAnswer}</strong>
          </div>
        </div>
      ) : (
        <RecoveryCallout review={review} />
      )}

      <div className="action-row">
        <Link className="button" href={nextHref}>
          {review.isSessionComplete ? "See summary" : "Next"}
        </Link>
      </div>
    </div>
  );
}

function RecoveryCallout({ review }: { review: AttemptReview }) {
  if (review.failureType === "spelling_error") {
    return (
      <div className="result-callout result-recovery">
        <strong>Let&apos;s fix the spelling.</strong>
        <span>This word will come back so the correct spelling has another chance to stick.</span>
        <SpellingDiff submitted={review.submittedAnswer} canonical={review.canonicalAnswer} />
      </div>
    );
  }

  return (
    <div className="result-callout result-recovery">
      <strong>{recoveryTitle(review.failureType)}</strong>
      <span>{recoveryCopy(review.failureType)}</span>
      <div className="canonical-answer">
        <span>Expected answer</span>
        <strong>{review.canonicalAnswer}</strong>
      </div>
    </div>
  );
}

function HintReview({ hints, openedCount }: { hints: string[]; openedCount: number }) {
  if (hints.length === 0) return null;
  return (
    <div className="hint-ladder compact-hint-ladder">
      <div className="hint-ladder-header">
        <strong>Hint ladder used</strong>
        <span>
          {openedCount} of {hints.length}
        </span>
      </div>
      {hints.map((hint, index) => {
        const wasOpened = index < openedCount;
        return (
          <div className={`hint-step${wasOpened ? " hint-step-open" : ""}`} key={`${hint}-${index}`}>
            <span className="hint-index">Hint {index + 1}</span>
            <span>{wasOpened ? hint : "Not used this time."}</span>
          </div>
        );
      })}
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

function DimensionBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="dimension-row">
      <span>{label}</span>
      <span className="dimension-bar">
        <span style={{ width: `${Math.round(value * 100)}%` }} />
      </span>
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
  return "The correction matters more than the miss. Read the expected answer, then move on when it feels clear.";
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

function roundStepLabel(step: AttemptReview["roundStep"]): string {
  if (step === "meaning_recognition") return "Meaning recognition";
  if (step === "context_usage") return "Context usage";
  if (step === "learn_cards") return "Learn cards";
  if (step === "spelling_production") return "Spelling";
  return "Round";
}
