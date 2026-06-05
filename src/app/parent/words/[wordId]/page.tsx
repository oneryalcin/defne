import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getWordDetail } from "@/lib/db/repository";
import { resolveSelectedLearnerId } from "@/lib/db/learners";
import type { MasteryColour } from "@/lib/types";
import { AttemptStrip } from "@/components/word-debug/AttemptStrip";
import { CompetitorList } from "@/components/word-debug/CompetitorList";
import { ConfidenceGauge } from "@/components/word-debug/ConfidenceGauge";
import { ProjectionChart } from "@/components/word-debug/ProjectionChart";

export const dynamic = "force-dynamic";

const COLOUR_FILL: Record<MasteryColour, string> = {
  red: "var(--mastery-red)",
  orange: "var(--mastery-orange)",
  yellow: "var(--mastery-yellow)",
  light_green: "var(--mastery-light)",
  green: "var(--mastery-green)",
};

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

export default async function WordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ wordId: string }>;
  searchParams?: Promise<{ learnerId?: string }>;
}) {
  const { wordId } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const learnerId = resolveSelectedLearnerId(resolvedSearchParams.learnerId);
  const detail = getWordDetail(wordId, learnerId);
  if (!detail) notFound();

  const colour = detail.masteryColour;
  const pHat =
    detail.attempts.length > 0
      ? detail.attempts.filter((a) => a.isCorrect).length /
        detail.attempts.length
      : 0;
  const activeRecentWrong = detail.scoreReasons.some((reason) =>
    reason.startsWith("Recent wrong still in recovery")
  );

  return (
    <main className="spread">
      <article
        className="book-page parent-spread"
        aria-labelledby="word-detail-title"
      >
        <header className="dash-header">
          <div className="dash-header__brand">
            <Link
              href={`/parent?learnerId=${encodeURIComponent(learnerId)}`}
              className="cover-chapter"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--steel-secondary)",
              }}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back to dashboard
            </Link>
          </div>
        </header>

        <header className="parent-head">
          <div>
            <span className="cover-chapter">Word detail</span>
            <h1
              id="word-detail-title"
              className="parent-head__title"
              style={{ display: "flex", alignItems: "baseline", gap: 16 }}
            >
              {detail.word}
              {colour ? (
                <span className={`mastery-mini ${COLOUR_KEY[colour]}`}>
                  <span
                    className="mastery-mini__dot"
                    aria-hidden="true"
                    style={{ background: COLOUR_FILL[colour] }}
                  />
                  {COLOUR_LABEL[colour]}
                </span>
              ) : (
                <span className="mastery-mini">
                  <span
                    className="mastery-mini__dot"
                    aria-hidden="true"
                    style={{ background: "rgba(31,41,55,0.30)" }}
                  />
                  Not started
                </span>
              )}
            </h1>
            {detail.definition ? (
              <p
                style={{
                  fontFamily: "var(--font-editorial)",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: "1.1rem",
                  color: "var(--graphite-ink)",
                  margin: "8px 0 0",
                }}
              >
                {detail.definition}
              </p>
            ) : null}
          </div>
        </header>

        {/* ============================================================
            BIG STATS — answers "where does this sit, will I see it soon?"
            ============================================================ */}
        <section className="dash-section" aria-labelledby="big-stats">
          <header className="section-head">
            <span className="section-head__label">Right now</span>
            <h2 id="big-stats" className="section-head__title">
              Where this word sits and where it&apos;s headed.
            </h2>
            <p className="section-head__sub">
              Priority rank shows raw urgency before spacing filters. The
              final next-round decision uses nine regular slots plus three
              comeback spaces.
            </p>
          </header>
          <div className="bento col-12">
            <div className="word-big-stats">
              <div className="word-big-stat">
                <span className="word-big-stat__label">Mastery confidence</span>
                <span className="word-big-stat__value">
                  {(detail.scoreLowerBound * 100).toFixed(0)}
                  <span className="word-big-stat__unit">% lower bound</span>
                </span>
              </div>
              <div className="word-big-stat">
                <span className="word-big-stat__label">Priority rank</span>
                <span className="word-big-stat__value">
                  {detail.rank.rank}
                  <span className="word-big-stat__unit">of {detail.rank.total}</span>
                </span>
              </div>
              <div className="word-big-stat">
                <span className="word-big-stat__label">Selected · next round</span>
                <span className="word-big-stat__value">
                  {(detail.pickProbabilityNow * 100).toFixed(0)}
                  <span className="word-big-stat__unit">%</span>
                </span>
              </div>
              <div className="word-big-stat">
                <span className="word-big-stat__label">Attempts</span>
                <span className="word-big-stat__value">
                  {detail.attempts.length}
                  <span className="word-big-stat__unit">
                    · ✓ {detail.attempts.filter((a) => a.isCorrect).length} · ✗{" "}
                    {detail.attempts.filter((a) => !a.isCorrect).length}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            CONFIDENCE GAUGE — visualise the Wilson lower bound on the bucket scale
            ============================================================ */}
        <section className="dash-section" aria-labelledby="why-colour">
          <header className="section-head">
            <span className="section-head__label">Why this colour</span>
            <h2 id="why-colour" className="section-head__title">
              Confidence band against the bucket scale.
            </h2>
            <p className="section-head__sub">
              The dark tick is the Wilson 80% lower bound — the value
              we bucket on. The faint tick is the naive correct ratio.
              They differ because 1/1 is not the same evidence as 5/5
              even though both have a mean of 1.0.
            </p>
          </header>
          <div className="bento col-12">
            <ConfidenceGauge
              lowerBound={detail.scoreLowerBound}
              pHat={pHat}
              effectiveN={detail.scoreEffectiveN}
            />
            {detail.nextBucket ? (
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-editorial)",
                  fontStyle: "italic",
                  fontWeight: 500,
                  fontSize: 15,
                  color: "var(--graphite-ink)",
                }}
              >
                To clear into <strong>{detail.nextBucket.label}</strong>:
                push the lower bound to{" "}
                <strong>{(detail.nextBucket.threshold * 100).toFixed(0)}%</strong>{" "}
                — typically{" "}
                {Math.max(
                  1,
                  Math.ceil(
                    (detail.nextBucket.threshold - detail.scoreLowerBound) * 6
                  )
                )}{" "}
                more clean correct attempts.
              </p>
            ) : (
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-editorial)",
                  fontStyle: "italic",
                  color: "var(--steel-secondary)",
                }}
              >
                Already at the top bucket. From here it only drops if the
                learner forgets it.
              </p>
            )}
            {activeRecentWrong ? (
              <p
                style={{
                  margin: 0,
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--mastery-red)",
                }}
              >
                ● Recent wrong still in recovery — colour was knocked down one
                bucket until enough clean follow-up questions clear it.
              </p>
            ) : null}
          </div>
        </section>

        {/* ============================================================
            FORECAST — when will this word appear?
            ============================================================ */}
        <section className="dash-section" aria-labelledby="forecast">
          <header className="section-head">
            <span className="section-head__label">Forecast (next 14 days)</span>
            <h2 id="forecast" className="section-head__title">
              When will this word come back?
            </h2>
            <p className="section-head__sub">
              If no one is practised, every word ages together — the
              Ebbinghaus curve drops on all of them. The green line is
              this word&apos;s chance of being picked in the next round
              each day after re-ranking the whole deck at that day. The
              orange dash marks the day the chance crosses 50%. A
              Reliable word that just got a clean correct will sit low
              for several days because everyone else is also rising.
            </p>
          </header>
          <div className="bento col-12">
            <ProjectionChart projection={detail.projection} />
          </div>
        </section>

        {/* ============================================================
            QUEUE — what's it competing against?
            ============================================================ */}
        <section className="dash-section" aria-labelledby="queue">
          <header className="section-head">
            <span className="section-head__label">Today&apos;s priority queue</span>
            <h2 id="queue" className="section-head__title">
              What it&apos;s fighting against for the twelve slots.
            </h2>
            <p className="section-head__sub">
              The selector fills nine regular priority slots plus three
              comeback slots for due Reliable and Mastered words. Outside
              the top twelve, a word usually waits for its due score to climb.
            </p>
          </header>
          <div className="bento col-12">
            <CompetitorList competitors={detail.competitors} />
          </div>
        </section>

        {/* ============================================================
            FACTOR BREAKDOWN — value × weight contributions
            ============================================================ */}
        <section className="dash-section" aria-labelledby="why-priority">
          <header className="section-head">
            <span className="section-head__label">Priority breakdown</span>
            <h2 id="why-priority" className="section-head__title">
              How this priority score got to {detail.priorityScore.toFixed(2)}.
            </h2>
            <p className="section-head__sub">
              Each factor is a (value × weight) pair. Recent failure and
              decay-due raise the score; just-answered penalty subtracts.
              See <code>docs/mastery-scoring-and-selection-v2.md</code> for the
              full pipeline.
            </p>
          </header>
          <div className="bento col-12">
            {detail.priorityFactors.length > 0 ? (
              <table className="priority-table">
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>Value</th>
                    <th>Weight</th>
                    <th>Contribution</th>
                    <th>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.priorityFactors.map((factor) => (
                    <tr key={factor.name}>
                      <td className="cell-mono">{factor.name}</td>
                      <td className="cell-mono">{factor.value.toFixed(3)}</td>
                      <td className="cell-mono">{factor.weight.toFixed(2)}</td>
                      <td
                        className="cell-mono"
                        style={{
                          color:
                            factor.contribution < 0
                              ? "var(--mastery-red)"
                              : "var(--graphite-ink)",
                        }}
                      >
                        {factor.contribution >= 0 ? "+" : ""}
                        {factor.contribution.toFixed(3)}
                      </td>
                      <td className="dim">{factor.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-state">
                No priority factors yet — this word has not been scored.
              </p>
            )}
          </div>
        </section>

        {/* ============================================================
            REASONS — plain language of the score derivation
            ============================================================ */}
        <section className="dash-section" aria-labelledby="reasons">
          <header className="section-head">
            <span className="section-head__label">In plain language</span>
            <h2 id="reasons" className="section-head__title">
              Why the colour landed where it did.
            </h2>
          </header>
          <div className="bento col-12">
            <ul className="reason-list">
              {detail.scoreReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* ============================================================
            TIMELINE — strip + table
            ============================================================ */}
        <section className="dash-section" aria-labelledby="timeline">
          <header className="section-head">
            <span className="section-head__label">Attempt timeline</span>
            <h2 id="timeline" className="section-head__title">
              Every time {detail.word} has been answered.
            </h2>
            <p className="section-head__sub">
              {detail.attempts.length} total — green dots correct, coral
              wrong. Larger dots used hints. The strip below the chart is
              ordered chronologically.
            </p>
          </header>
          <div className="bento col-12">
            <AttemptStrip
              attempts={detail.attempts.map((a) => ({
                id: a.id,
                answeredAt: a.answeredAt,
                isCorrect: a.isCorrect,
                hintLevelUsed: a.hintLevelUsed,
              }))}
            />
            {detail.attempts.length > 0 ? (
              <table className="word-table" aria-label="Attempt detail">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Step</th>
                    <th>Question type</th>
                    <th>Correct?</th>
                    <th>Hint</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.attempts.map((attempt) => (
                    <tr
                      key={attempt.id}
                      style={{
                        background: attempt.isCorrect
                          ? "rgba(127, 176, 105, 0.08)"
                          : "rgba(209, 73, 91, 0.08)",
                      }}
                    >
                      <td className="cell-mono">
                        {new Date(attempt.answeredAt).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="cell-mono">
                        {attempt.roundStep ?? "—"}
                        {attempt.passNumber ? ` p${attempt.passNumber}` : ""}
                      </td>
                      <td className="cell-mono">
                        {attempt.questionType ?? "—"}
                      </td>
                      <td className="cell-mono">
                        {attempt.isCorrect ? "✓" : "✗"}
                      </td>
                      <td className="cell-mono">
                        {attempt.hintLevelUsed > 0
                          ? `+${attempt.hintLevelUsed}`
                          : "—"}
                      </td>
                      <td className="dim">{attempt.submittedAnswer ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </section>

        {/* ============================================================
            HOW IT WORKS — short explanation, plus link to full doc
            ============================================================ */}
        <section className="dash-section" aria-labelledby="how-it-works">
          <header className="section-head">
            <span className="section-head__label">How the scheduler works</span>
            <h2 id="how-it-works" className="section-head__title">
              Twelve slots, every round.
            </h2>
            <p className="section-head__sub">
              The deck competes for twelve slots per round: nine regular
              priority slots, plus three comeback spaces for due Reliable
              and Mastered words. The factors that raise priority: decay
              (the longer you have not seen it, the higher); confidence gap
              (lower bound below 1.0); recent wrong; almost-mastered nudge.
              The factors that lower it: just-answered penalty, mastered floor.
            </p>
          </header>
          <div className="bento col-12">
            <ul className="reason-list">
              <li>
                <strong>Needs-work / Building</strong> words tend to dominate
                the queue — they have low confidence and (often) recent
                wrongs, so two of the strongest factors are pegged high.
              </li>
              <li>
                <strong>Reliable</strong> words usually wait until decay
                (Ebbinghaus) lifts dueScore enough — typically a week,
                because <code>stabilityDays</code> grows on each clean
                correct.
              </li>
              <li>
                <strong>Mastered</strong> words get a small floor priority
                + a small bump from decay only. They stay out of the queue
                unless the deck is otherwise empty or recall has dropped
                below ~40%.
              </li>
              <li>
                <strong>Untouched</strong> words sit at a flat 0.4 — picked
                only when nothing needier is queued. So a deck with many
                Building words will pull from those before introducing new
                ones.
              </li>
            </ul>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-body)",
                fontSize: 13,
                color: "var(--steel-secondary)",
              }}
            >
              Full pipeline + thresholds + caveats:{" "}
              <code>docs/mastery-scoring-and-selection-v2.md</code>.
            </p>
          </div>
        </section>

        {/* ============================================================
            RAW STATE — last, for debugging
            ============================================================ */}
        {detail.state ? (
          <section className="dash-section" aria-labelledby="state">
            <header className="section-head">
              <span className="section-head__label">Raw state</span>
              <h2 id="state" className="section-head__title">
                What the database stores.
              </h2>
              <p className="section-head__sub">
                Useful when something looks off — these are the inputs to
                the algorithm.
              </p>
            </header>
            <div className="bento col-12">
              <table className="word-table">
                <tbody>
                  <StateRow label="stabilityDays" value={detail.state.stabilityDays.toFixed(2)} />
                  <StateRow
                    label="averageHintLevelUsed"
                    value={detail.state.averageHintLevelUsed.toFixed(2)}
                  />
                  <StateRow label="lastSeenAt" value={detail.state.lastSeenAt ?? "—"} />
                  <StateRow label="lastCorrectAt" value={detail.state.lastCorrectAt ?? "—"} />
                  <StateRow label="lastWrongAt" value={detail.state.lastWrongAt ?? "—"} />
                  <StateRow label="nextReviewAt" value={detail.state.nextReviewAt ?? "—"} />
                  <StateRow
                    label="nearReview"
                    value={detail.state.nearReview ? "yes" : "no"}
                  />
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="cell-mono" style={{ width: "30%" }}>
        {label}
      </td>
      <td className="dim cell-mono">{value}</td>
    </tr>
  );
}
