import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getWordDetail } from "@/lib/db/repository";
import type { MasteryColour } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLOUR_FILL: Record<MasteryColour, string> = {
  red: "var(--mastery-red)",
  orange: "var(--mastery-orange)",
  yellow: "var(--mastery-yellow)",
  light_green: "var(--mastery-light)",
  green: "var(--mastery-green)",
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
}: {
  params: Promise<{ wordId: string }>;
}) {
  const { wordId } = await params;
  const detail = getWordDetail(wordId);
  if (!detail) notFound();

  const colour = detail.masteryColour;

  return (
    <main className="spread">
      <article
        className="book-page parent-spread"
        aria-labelledby="word-detail-title"
      >
        <header className="dash-header">
          <div className="dash-header__brand">
            <Link
              href="/parent"
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
                <span
                  className="mastery-mini"
                  style={{
                    background:
                      colour === "red"
                        ? "var(--mastery-red-bg)"
                        : colour === "orange"
                          ? "var(--mastery-orange-bg)"
                          : colour === "yellow"
                            ? "var(--mastery-yellow-bg)"
                            : colour === "light_green"
                              ? "var(--mastery-light-bg)"
                              : "var(--mastery-green-bg)",
                  }}
                >
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

        {/* Section: Why this colour */}
        <section className="dash-section" aria-labelledby="why-colour">
          <header className="section-head">
            <span className="section-head__label">Why this colour</span>
            <h2 id="why-colour" className="section-head__title">
              How the algorithm read the evidence.
            </h2>
            <p className="section-head__sub">
              Wilson 80% lower bound: <strong>{(detail.scoreLowerBound * 100).toFixed(0)}%</strong>.
              See <code>docs/mastery-scoring-and-selection-v2.md</code> for the full pipeline.
            </p>
          </header>
          <div className="bento col-12">
            <ul className="reason-list">
              {detail.scoreReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        </section>

        {/* Section: Why this priority */}
        <section className="dash-section" aria-labelledby="why-priority">
          <header className="section-head">
            <span className="section-head__label">Why this priority</span>
            <h2 id="why-priority" className="section-head__title">
              How likely the scheduler is to pick it next.
            </h2>
            <p className="section-head__sub">
              Total priority score:{" "}
              <strong>{detail.priorityScore.toFixed(3)}</strong>. Higher = more
              likely to surface.
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

        {/* Section: Attempt timeline */}
        <section className="dash-section" aria-labelledby="timeline">
          <header className="section-head">
            <span className="section-head__label">Attempt timeline</span>
            <h2 id="timeline" className="section-head__title">
              Every time {detail.word} has been answered.
            </h2>
            <p className="section-head__sub">
              {detail.attempts.length} total. Most recent first. Greener rows
              answered correctly; coral were missed.
            </p>
          </header>
          <div className="bento col-12">
            {detail.attempts.length > 0 ? (
              <table className="word-table" aria-label="Attempt timeline">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Step</th>
                    <th>Question type</th>
                    <th>Correct?</th>
                    <th>Hint level</th>
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
            ) : (
              <p className="empty-state">
                No attempts recorded yet for this word.
              </p>
            )}
          </div>
        </section>

        {/* Section: State snapshot */}
        {detail.state ? (
          <section className="dash-section" aria-labelledby="state">
            <header className="section-head">
              <span className="section-head__label">Raw state</span>
              <h2 id="state" className="section-head__title">
                What the database stores.
              </h2>
              <p className="section-head__sub">
                Useful when something looks off — these are the inputs to the
                algorithm.
              </p>
            </header>
            <div className="bento col-12">
              <table className="word-table">
                <tbody>
                  <StateRow label="meaningMastery" value={detail.state.meaningMastery.toFixed(3)} />
                  <StateRow label="usageMastery" value={detail.state.usageMastery.toFixed(3)} />
                  <StateRow
                    label="spellingMastery (ignored by colour)"
                    value={detail.state.spellingMastery.toFixed(3)}
                  />
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
