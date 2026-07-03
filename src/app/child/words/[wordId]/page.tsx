import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
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

type WordDetail = NonNullable<ReturnType<typeof getWordDetail>>;

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
  const learningPlan = buildLearningPlan(detail);

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
              <SmallStat label="Trust" value={trustLabel(Math.round(detail.scoreLowerBound * 100))} />
            </div>
            <p className="child-word-action-note">{progressMessage(colour, activeRecentWrong)}</p>
            {learningPlan.evidence.length > 0 ? (
              <ul className="child-word-reasons">
                {learningPlan.evidence.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="child-word-card child-word-card--wide" aria-labelledby="child-word-journey-title">
            <span className="metric-label">How to move up</span>
            <h2 id="child-word-journey-title">What this word needs next</h2>
            <p className="child-word-action-note">{learningPlan.message}</p>
            <LearningProgressGraph detail={detail} plan={learningPlan} />
            <LearningPlanCards plan={learningPlan} />
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

function LearningProgressGraph({ detail, plan }: { detail: WordDetail; plan: LearningPlan }) {
  const currentRank = stageRank(detail.masteryColour);
  const maxRank = MASTERY_STAGES.length - 1;
  const progress = `${Math.round((currentRank / maxRank) * 100)}%`;
  const nextStage = MASTERY_STAGES[Math.min(currentRank + 1, maxRank)];
  const confidence = Math.round(detail.scoreLowerBound * 100);
  const trust = trustLabel(confidence);
  const confidenceStyle = { "--confidence": `${confidence * 3.6}deg` } as CSSProperties;

  return (
    <div className="child-progress-graph" aria-label="Word progress graph">
      <div className="child-progress-graph__top">
        <div>
          <span className="child-progress-graph__label">Path</span>
          <strong>{plan.now}</strong>
          <p>Next stop: {detail.masteryColour === "green" ? "resting" : nextStage.label}</p>
        </div>
        <div className="child-confidence-ring" style={confidenceStyle} aria-label={`Trust level: ${trust}`}>
          <strong>{trust}</strong>
          <span>trust</span>
        </div>
      </div>
      <div className="child-progress-graph__rail" aria-hidden="true">
        <span className="child-progress-graph__fill" style={{ width: progress }} />
        {MASTERY_STAGES.map((stage, index) => {
          const reached = index <= currentRank;
          return (
            <span
              key={stage.label}
              className={`child-progress-graph__dot${reached ? " is-reached" : ""}`}
              style={{ left: `${Math.round((index / maxRank) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="child-progress-graph__footer">
        <span>Start</span>
        <span>{plan.when}</span>
        <span>Mastered</span>
      </div>
    </div>
  );
}

function LearningPlanCards({ plan }: { plan: LearningPlan }) {
  return (
    <div className="child-learning-plan" aria-label="Learning plan">
      <div className="child-learning-plan__item">
        <span>Now</span>
        <strong>{plan.now}</strong>
      </div>
      <div className="child-learning-plan__item">
        <span>Next</span>
        <strong>{plan.next}</strong>
      </div>
      <div className="child-learning-plan__item">
        <span>When</span>
        <strong>{plan.when}</strong>
      </div>
    </div>
  );
}

function MasteryJourney({ detail }: { detail: WordDetail }) {
  const currentRank = stageRank(detail.masteryColour);
  const state = detail.state;
  const correctCount = detail.attempts.filter((attempt) => attempt.isCorrect).length;
  const recoveryOpen = hasOpenRecovery(detail);
  const masteredReady =
    detail.scoreLowerBound >= MASTERED_CONFIDENCE &&
    (state?.stabilityDays ?? 0) >= masteredRequiredStabilityDays(detail) &&
    correctCount >= MASTERED_MIN_CORRECT &&
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
    description: "Practise slowly with the examples.",
    className: "is-red",
  },
  {
    colour: "orange",
    label: "Building",
    description: "Clean answers are starting to build trust.",
    className: "is-orange",
  },
  {
    colour: "yellow",
    label: "Nearly steady",
    description: "You are close. Check it again later.",
    className: "is-yellow",
  },
  {
    colour: "light_green",
    label: "Reliable",
    description: "You usually know it.",
    className: "is-light_green",
  },
  {
    colour: "green",
    label: "Mastered",
    description: "You know it well. Only rare check-ins now.",
    className: "is-green",
  },
];

function stageRank(colour: MasteryColour | null): number {
  if (!colour) return 0;
  const index = MASTERY_STAGES.findIndex((stage) => stage.colour === colour);
  return index >= 0 ? index : 0;
}

interface LearningPlan {
  message: string;
  now: string;
  next: string;
  when: string;
  evidence: string[];
}

const MASTERED_CONFIDENCE = 0.77;
const MASTERED_STABILITY_DAYS = 7;
const MASTERED_MIN_CORRECT = 5;
const MISTAKE_RECOVERY_FOLLOW_UPS = 3;
const SPACED_CORRECT_STABILITY_MULTIPLIER = 1.4;

function buildLearningPlan(detail: WordDetail): LearningPlan {
  const correctCount = detail.attempts.filter((attempt) => attempt.isCorrect).length;
  const wrongCount = detail.attempts.length - correctCount;
  const confidence = Math.round(detail.scoreLowerBound * 100);
  const state = detail.state;
  const recoveryOpen = hasOpenRecovery(detail);
  const status = detail.masteryColour ? COLOUR_LABEL[detail.masteryColour] : "Not started";
  const requiredStability = masteredRequiredStabilityDays(detail);
  const evidence = childEvidence(detail, confidence, correctCount, wrongCount, recoveryOpen, requiredStability);

  if (!detail.masteryColour) {
    return {
      message: "This word has not appeared in a question yet. One real try will start its colour.",
      now: "Ready to begin",
      next: "Try it once",
      when: roughNextAppearance(detail),
      evidence,
    };
  }

  if (recoveryOpen) {
    const cleanNeeded = Math.max(1, Math.min(2, state?.recoveryDebt ?? 1));
    return {
      message: `A recent slip needs ${cleanNeeded} careful clean answer${cleanNeeded === 1 ? "" : "s"}. It does not erase what you already know.`,
      now: status,
      next: `${cleanNeeded} careful answer${cleanNeeded === 1 ? "" : "s"}`,
      when: roughNextAppearance(detail),
      evidence,
    };
  }

  if (detail.scoreLowerBound < 0.3) {
    return planForConfidence(detail, status, "Building", evidence);
  }
  if (detail.scoreLowerBound < 0.55) {
    return planForConfidence(detail, status, "Nearly steady", evidence);
  }
  if (detail.scoreLowerBound < 0.7) {
    return planForConfidence(detail, status, "Reliable", evidence);
  }
  if (detail.scoreLowerBound < MASTERED_CONFIDENCE) {
    return planForConfidence(detail, status, "Mastered", evidence);
  }

  if (detail.masteryColour === "green") {
    return {
      message: "This word is Mastered. It mostly rests now unless a parent asks for it or there is a spare review space.",
      now: "Mastered",
      next: "Rest",
      when: roughNextAppearance(detail),
      evidence,
    };
  }

  const stabilityDays = state?.stabilityDays ?? 0;
  if (stabilityDays < requiredStability) {
    const checks = spacedChecksNeeded(stabilityDays, requiredStability);
    return {
      message:
        checks <= 1
          ? "This word is very close. One clean answer on another day may be enough for Mastered."
          : `This word is close. It likely needs about ${checks} clean checks on different days to show it still sticks.`,
      now: status,
      next: checks <= 1 ? "One spaced clean answer" : `${checks} spaced clean answers`,
      when: roughNextAppearance(detail),
      evidence,
    };
  }
  if (correctCount < MASTERED_MIN_CORRECT) {
    const remaining = MASTERED_MIN_CORRECT - correctCount;
    return {
      message: `This word needs ${remaining} more correct answer${remaining === 1 ? "" : "s"} before it can be Mastered.`,
      now: status,
      next: `${remaining} correct answer${remaining === 1 ? "" : "s"}`,
      when: roughNextAppearance(detail),
      evidence,
    };
  }
  if ((state?.averageHintLevelUsed ?? 0) > 0.5) {
    return {
      message: "This word is strong. To Master it, try answering without much hint help.",
      now: status,
      next: "Try without hints",
      when: roughNextAppearance(detail),
      evidence,
    };
  }
  return {
    message: "This word looks strong. One clean answer when it appears again should help it move up.",
    now: status,
    next: "One clean refresh",
    when: roughNextAppearance(detail),
    evidence,
  };
}

function planForConfidence(
  detail: WordDetail,
  status: string,
  target: string,
  evidence: string[]
): LearningPlan {
  return {
    message: `This word is heading toward ${target}. Clean answers tell the app you still know it.`,
    now: status,
    next: "Clean answers",
    when: roughNextAppearance(detail),
    evidence,
  };
}

function childEvidence(
  detail: WordDetail,
  confidence: number,
  correctCount: number,
  wrongCount: number,
  recoveryOpen: boolean,
  requiredStability: number
): string[] {
  const state = detail.state;
  const seenLine =
    detail.attempts.length > 0
      ? `It has appeared ${detail.attempts.length} time${detail.attempts.length === 1 ? "" : "s"}; last time was ${lastSeenLabel(detail)}.`
      : "It has not appeared in a question yet.";
  const spacingLine =
    state && detail.masteryColour !== "green"
      ? `For Mastered, it needs strong clean answers and about ${requiredStability.toFixed(1)} days of spacing; it has ${state.stabilityDays.toFixed(1)}.`
      : "Mastered words keep their colour and mostly rest.";
  const evidence = [
    seenLine,
    `${correctCount} correct and ${wrongCount} ${wrongCount === 1 ? "miss" : "misses"} so far.`,
    trustEvidence(confidence, correctCount, wrongCount),
    spacingLine,
  ];
  if (recoveryOpen) {
    evidence.push("There is a recent slip to repair.");
  } else {
    evidence.push("No recent slip is waiting for repair.");
  }
  return evidence;
}

function trustLabel(confidence: number): string {
  if (confidence >= 80) return "Strong";
  if (confidence >= 60) return "Steady";
  if (confidence >= 35) return "Growing";
  return "Fresh check";
}

function trustEvidence(confidence: number, correctCount: number, wrongCount: number): string {
  if (confidence >= 80) return "The app has strong trust in this word.";
  if (confidence >= 60) return "The app trusts it, and a clean answer can make it stronger.";
  if (confidence >= 35) return "The app is starting to trust it.";
  if (correctCount > wrongCount) return "The app wants a fresh clean answer to trust it again.";
  return "Clean answers will help the app trust it.";
}

function masteredRequiredStabilityDays(detail: WordDetail): number {
  const correctCount = detail.attempts.filter((attempt) => attempt.isCorrect).length;
  const wrongCount = detail.attempts.length - correctCount;
  const extraEvidence = Math.max(0, correctCount + wrongCount - MASTERED_MIN_CORRECT);
  return Math.max(3, MASTERED_STABILITY_DAYS - extraEvidence * 0.35);
}

function hasOpenRecovery(detail: WordDetail): boolean {
  const state = detail.state;
  if (!state) return false;
  return (
    (state.nearReview || state.recoveryDebt > 0) &&
    state.eligibleQuestionsSinceLastMistake < MISTAKE_RECOVERY_FOLLOW_UPS
  );
}

function spacedChecksNeeded(stabilityDays: number, requiredStabilityDays: number): number {
  if (stabilityDays >= requiredStabilityDays) return 0;
  if (stabilityDays <= 0) return 1;
  return Math.max(
    1,
    Math.ceil(Math.log(requiredStabilityDays / stabilityDays) / Math.log(SPACED_CORRECT_STABILITY_MULTIPLIER))
  );
}

function roughNextAppearance(detail: WordDetail): string {
  if (detail.priorityMode === "next_round_once") return "Next mission";
  if (detail.masteryColour === "green") return "Rarely";
  const state = detail.state;
  if (state?.recoveryDebt || state?.nearReview) return "Soon";
  if (!state?.lastSeenAt) return "Soon";
  if (state.nextReviewAt) {
    const nextReview = new Date(state.nextReviewAt).getTime();
    if (Number.isFinite(nextReview) && nextReview > Date.now()) return `Around ${friendlyDate(state.nextReviewAt)}`;
  }
  return "When it fits the mix";
}

function lastSeenLabel(detail: WordDetail): string {
  const state = detail.state;
  if (!state?.lastSeenAt) return "not yet";
  const lastSeen = new Date(state.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeen)) return "not yet";
  const days = Math.max(0, (Date.now() - lastSeen) / 86_400_000);
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  return `${Math.round(days)} days ago`;
}

function friendlyDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
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
    return "A recent slip is queued for repair. It does not erase what you already know.";
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
      return "This word is Mastered. Its colour will not fade just because time passes.";
    default:
      return "This word has not been practised yet. One real attempt will start its colour.";
  }
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
