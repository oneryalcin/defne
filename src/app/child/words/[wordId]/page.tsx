import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import {
  clearChildVocabularyWordPriorityAction,
  requestChildVocabularyWordNextRoundAction
} from "@/app/actions";
import { getWordDetail } from "@/lib/db/repository";
import {
  getLearnerAccessByCode,
  vocabularyWordIsActiveForLearner
} from "@/lib/db/learners";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";
import type { MasteryColour } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLOUR_KEY: Record<MasteryColour, string> = {
  red: "is-red",
  orange: "is-orange",
  yellow: "is-yellow",
  light_green: "is-light_green",
  green: "is-green",
};

const COLOUR_LABEL: Record<MasteryColour, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered",
};

type SearchParams = Promise<{ from?: string }>;

export default async function ChildWordDetailPage({
  params,
}: {
  params: Promise<{ wordId: string }>;
  searchParams?: SearchParams;
}) {
  const learnerId = await resolveChildLearnerId();
  if (!learnerId) notFound();

  const { wordId } = await params;
  if (!vocabularyWordIsActiveForLearner(learnerId, wordId)) notFound();

  const detail = getWordDetail(wordId, learnerId);
  if (!detail) notFound();

  const colour = detail.masteryColour;
  const colourLabel = colour ? COLOUR_LABEL[colour] : "Not started";
  const examples = detail.examples.slice(0, 3);
  const activeRecentWrong = detail.scoreReasons.some((reason) =>
    reason.startsWith("Recent wrong still in recovery")
  );

  return (
    <main className="spread">
      <article className="book-page child-word-page" aria-labelledby="child-word-title">
        <header className="child-word-page__header">
          <Link className="cover-chapter child-word-page__back" href="/child/words">
            <ArrowLeft size={14} aria-hidden="true" />
            Back to words
          </Link>
          <div className="child-word-page__title-row">
            <div>
              <span className="cover-chapter">Word page</span>
              <h1 id="child-word-title" className="cover-title child-word-page__title">
                {detail.word}
              </h1>
            </div>
            {colour ? (
              <span className={`mastery-mini ${COLOUR_KEY[colour]}`}>
                <span className="mastery-mini__dot" aria-hidden="true" />
                {colourLabel}
              </span>
            ) : (
              <span className="mastery-mini">
                <span
                  className="mastery-mini__dot"
                  aria-hidden="true"
                  style={{ background: "rgba(31,41,55,0.30)" }}
                />
                {colourLabel}
              </span>
            )}
          </div>
          {detail.definition ? (
            <p className="child-word-page__definition">{detail.definition}</p>
          ) : null}
        </header>

        <section className="child-word-page__body" aria-label={`${detail.word} study details`}>
          <div className="child-word-support">
            {detail.synonyms.length > 0 ? (
              <DetailBlock label="Synonyms">{detail.synonyms.join(", ")}</DetailBlock>
            ) : null}
            {detail.antonyms.length > 0 ? (
              <DetailBlock label="Antonyms">{detail.antonyms.join(", ")}</DetailBlock>
            ) : null}
            {examples.length > 0 ? (
              <section className="child-word-card child-word-card--wide">
                <span className="metric-label">Examples</span>
                <ol className="child-word-examples">
                  {examples.map((example) => (
                    <li key={example}>{highlightWordInText(example, detail.word)}</li>
                  ))}
                </ol>
              </section>
            ) : null}
          </div>

          <section className="child-word-card" aria-labelledby="child-word-progress-title">
            <span className="metric-label">Why this colour</span>
            <h2 id="child-word-progress-title">How it is going</h2>
            <div className="child-word-stats" aria-label="Word progress stats">
              <SmallStat label="Seen" value={detail.attempts.length.toString()} />
              <SmallStat
                label="Correct"
                value={detail.attempts.filter((attempt) => attempt.isCorrect).length.toString()}
              />
              <SmallStat
                label="Wrong"
                value={detail.attempts.filter((attempt) => !attempt.isCorrect).length.toString()}
              />
              <SmallStat label="Confidence" value={`${Math.round(detail.scoreLowerBound * 100)}%`} />
            </div>
            <p className="child-word-action-note">{progressMessage(colour, activeRecentWrong)}</p>
            {detail.scoreReasons.length > 0 ? (
              <ul className="child-word-reasons">
                {detail.scoreReasons.slice(0, 3).map((reason) => (
                  <li key={reason}>{childFriendlyReason(reason)}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="child-word-card child-word-card--wide" aria-labelledby="child-word-journey-title">
            <span className="metric-label">How to move up</span>
            <h2 id="child-word-journey-title">What this word needs next</h2>
            <p className="child-word-action-note">{nextStepMessage(detail)}</p>
            <MasteryJourney detail={detail} />
          </section>

          <section className="child-word-card" aria-labelledby="child-word-next-title">
            <span className="metric-label">Next round</span>
            <h2 id="child-word-next-title">Want to practise this soon?</h2>
            <p className="child-word-action-note">
              This asks the next vocabulary mission to include {detail.word} once.
              It does not change the colour by itself.
            </p>
            {detail.priorityMode === "next_round_once" ? (
              <form action={clearChildVocabularyWordPriorityAction} className="child-word-action-form">
                <input type="hidden" name="wordId" value={detail.id} />
                <button className="ribbon ribbon--ghost child-word-action-button" type="submit">
                  <RotateCcw size={18} aria-hidden="true" />
                  Undo next round
                </button>
              </form>
            ) : (
              <form action={requestChildVocabularyWordNextRoundAction} className="child-word-action-form">
                <input type="hidden" name="wordId" value={detail.id} />
                <button className="ribbon child-word-action-button" type="submit">
                  Practise next round
                </button>
              </form>
            )}
          </section>
        </section>
      </article>
    </main>
  );
}

function MasteryJourney({ detail }: { detail: NonNullable<ReturnType<typeof getWordDetail>> }) {
  const currentRank = stageRank(detail.masteryColour);
  const state = detail.state;
  const correctCount = detail.attempts.filter((attempt) => attempt.isCorrect).length;
  const recoveryOpen = Boolean(state && (state.recoveryDebt > 0 || state.nearReview));
  const masteredReady =
    detail.scoreLowerBound >= 0.8 &&
    (state?.stabilityDays ?? 0) >= 7 &&
    correctCount >= 4 &&
    (state?.averageHintLevelUsed ?? 0) <= 0.5 &&
    !recoveryOpen;

  return (
    <div className="child-mastery-journey">
      {MASTERY_STAGES.map((stage, index) => {
        const reached = currentRank >= index || (stage.colour === "green" && masteredReady);
        const current = currentRank === index;
        return (
          <div
            key={stage.label}
            className={`child-mastery-step${reached ? " is-reached" : ""}${current ? " is-current" : ""}`}
          >
            <span className={`child-mastery-step__dot ${stage.className}`} aria-hidden="true" />
            <div>
              <strong>{stage.label}</strong>
              <span>{stage.description}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const MASTERY_STAGES: Array<{
  colour: MasteryColour | null;
  label: string;
  description: string;
  className: string;
}> = [
  {
    colour: null,
    label: "Not started",
    description: "Try it once to begin.",
    className: "is-not_started",
  },
  {
    colour: "red",
    label: "Needs work",
    description: "Start repairing it with careful answers.",
    className: "is-red",
  },
  {
    colour: "orange",
    label: "Building",
    description: "Get a few more answers right without lots of help.",
    className: "is-orange",
  },
  {
    colour: "yellow",
    label: "Nearly steady",
    description: "Keep it correct after some time has passed.",
    className: "is-yellow",
  },
  {
    colour: "light_green",
    label: "Reliable",
    description: "Show strong confidence and no open mistake repair.",
    className: "is-light_green",
  },
  {
    colour: "green",
    label: "Mastered",
    description: "High confidence, steady for 7 days, 4+ correct, no recovery debt.",
    className: "is-green",
  },
];

function stageRank(colour: MasteryColour | null): number {
  if (!colour) return 0;
  const index = MASTERY_STAGES.findIndex((stage) => stage.colour === colour);
  return index >= 0 ? index : 0;
}

function nextStepMessage(detail: NonNullable<ReturnType<typeof getWordDetail>>): string {
  if (!detail.masteryColour) {
    return "Answer this word in a practice round to start its colour.";
  }

  const state = detail.state;
  const correctCount = detail.attempts.filter((attempt) => attempt.isCorrect).length;
  const confidence = Math.round(detail.scoreLowerBound * 100);
  const recoveryOpen = Boolean(state && (state.recoveryDebt > 0 || state.nearReview));

  if (recoveryOpen) {
    return "First repair the recent miss: answer it cleanly a few times so the mistake is closed.";
  }
  if (detail.scoreLowerBound < 0.3) {
    return `To reach Building, aim for about 30% confidence. This word is at ${confidence}% now.`;
  }
  if (detail.scoreLowerBound < 0.55) {
    return `To reach Nearly steady, aim for about 55% confidence. This word is at ${confidence}% now.`;
  }
  if (detail.scoreLowerBound < 0.7) {
    return `To reach Reliable, aim for about 70% confidence. This word is at ${confidence}% now.`;
  }
  if (detail.scoreLowerBound < 0.8) {
    return `To reach Mastered, aim for about 80% confidence. This word is at ${confidence}% now.`;
  }
  if ((state?.stabilityDays ?? 0) < 7) {
    return `To reach Mastered, keep it steady for 7 days. It is steady for ${(state?.stabilityDays ?? 0).toFixed(1)} days now.`;
  }
  if (correctCount < 4) {
    return `To reach Mastered, get at least 4 correct answers. You have ${correctCount} so far.`;
  }
  if ((state?.averageHintLevelUsed ?? 0) > 0.5) {
    return "To reach Mastered, answer with less help from hints.";
  }
  if (detail.masteryColour === "green") {
    return "This word is Mastered. It will come back only sometimes so it stays fresh.";
  }
  return "This word has the evidence for Mastered. One more clean refresh should keep it strong.";
}

async function resolveChildLearnerId(): Promise<string | null> {
  const cookieStore = await cookies();
  const session = parsePilotSession(cookieStore.get(PILOT_SESSION_COOKIE)?.value);
  if (!session || session.role !== "child") return null;
  if (session.learnerId) return session.learnerId;
  return getLearnerAccessByCode(session.accessCode)?.learnerId ?? null;
}

function DetailBlock({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="child-word-card">
      <span className="metric-label">{label}</span>
      <p>{children}</p>
    </section>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="child-word-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function progressMessage(colour: MasteryColour | null, activeRecentWrong: boolean): string {
  if (activeRecentWrong) {
    return "A recent miss pulled this word down. Clean answers will help it recover.";
  }
  switch (colour) {
    case "red":
      return "This word needs attention. Reading the examples and answering without hints will help most.";
    case "orange":
      return "This word is building. A few clean correct answers can move it up.";
    case "yellow":
      return "This word is nearly steady. Keep getting it right after a little time has passed.";
    case "light_green":
      return "This word is reliable. A clean answer later helps prove it is sticking.";
    case "green":
      return "This word is strong. It will still return later so it does not fade.";
    default:
      return "This word has not been practised yet. One real attempt will start its colour.";
  }
}

function childFriendlyReason(reason: string): string {
  if (reason.startsWith("Not started")) return "No practice answers yet.";
  if (reason.startsWith("Seen")) return reason.replace("Seen", "You have seen it");
  if (reason.startsWith("Confidence")) return reason.replace("Confidence", "Confidence score");
  if (reason.startsWith("Recent wrong")) return "A recent miss is still being repaired.";
  return reason;
}

function highlightWordInText(text: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(\\b${escaped}\\b)`, "gi"));
  return parts.map((part, index) =>
    part.toLocaleLowerCase("en-GB") === word.toLocaleLowerCase("en-GB") ? (
      <mark className="context-example__word" key={`${part}-${index}`}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}
