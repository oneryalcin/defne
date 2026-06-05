import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { createChildAction, setNextRoundMixAction, setVisualCuesAction } from "@/app/actions";
import {
  getMissionPreview,
  getParentDashboard,
  getParentWords,
} from "@/lib/db/repository";
import { getChildSpellingWords } from "@/lib/db/spellingRepository";
import { listLearners, resolveSelectedLearnerId } from "@/lib/db/learners";
import type { MasteryColour } from "@/lib/types";
import { WordHeatmap } from "@/components/WordHeatmap";
import {
  MASTERY_KEY,
  MASTERY_LABELS,
  ProgressDistribution,
  spellingProgressBuckets,
  vocabularyProgressBuckets,
} from "@/components/ProgressDistribution";

const HEATMAP_PAGE_SIZE = 200;

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ p?: string; learnerId?: string }>;

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const learners = listLearners();
  const learnerId = resolveSelectedLearnerId(resolvedSearchParams.learnerId);
  const selectedLearner = learners.find((learner) => learner.id === learnerId) ?? learners[0];
  const dashboard = getParentDashboard(learnerId);
  const heatmapPage = Math.max(1, parseInt(resolvedSearchParams.p ?? "1", 10) || 1);
  const nextRound = (() => {
    try {
      return getMissionPreview(12, learnerId);
    } catch {
      return null;
    }
  })();

  const stillWorking = [
    ...dashboard.redOrangeWords,
    ...dashboard.dueWords,
  ]
    .filter((word, idx, list) => list.findIndex((w) => w.id === word.id) === idx)
    .slice(0, 6);

  // True deck-wide distribution from the actual learner state (one row per word).
  const allWords = getParentWords(learnerId);
  const spellingWords = getChildSpellingWords(learnerId);
  const vocabularyBuckets = vocabularyProgressBuckets(allWords);
  const spellingBuckets = spellingProgressBuckets(spellingWords);

  const todayLabel = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const lastSession = dashboard.latestSession
    ? new Date(dashboard.latestSession.startedAt).toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : "no sessions yet";

  return (
    <main className="spread">
      <article className="book-page parent-spread" aria-labelledby="parent-title">
        <header className="dash-header">
          <div className="dash-header__brand">
            <span className="cover-chapter">{dashboard.learnerName} · pilot dashboard</span>
            <span className="dash-header__sub">Last round · {lastSession}</span>
          </div>
          <div className="dash-header__right">
            <span
              className="dash-child-pill"
              aria-label="Active learner"
            >
              <span
                className="dash-child-pill__avatar"
                style={{
                  backgroundImage:
                    "url(/assets/avatar-canonical-v1.png)",
                }}
                aria-hidden="true"
              />
              <span className="dash-child-pill__name">
                <strong>{dashboard.learnerName}</strong>
                <span>{selectedLearner?.yearGroup ?? "Year 5"} · British English</span>
              </span>
            </span>
          </div>
        </header>

        <section className="dash-section" aria-labelledby="children">
          <header className="section-head">
            <span className="section-head__label">Children</span>
            <h2 id="children" className="section-head__title">Choose the active child.</h2>
            <p className="section-head__sub">New children start with an empty deck. Add existing library words or create new vocabulary for the selected child.</p>
          </header>
          <div className="bento-grid">
            <div className="bento col-8">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {learners.map((learner) => (
                  <Link
                    key={learner.id}
                    className={learner.id === learnerId ? "ribbon" : "ribbon ribbon--ghost"}
                    href={`/parent?learnerId=${encodeURIComponent(learner.id)}`}
                  >
                    {learner.displayName} · {learner.vocabularyCount} words
                  </Link>
                ))}
              </div>
            </div>
            <form action={createChildAction} className="bento col-4">
              <span className="bento__eyebrow">New child</span>
              <label>
                Name
                <input className="field" name="displayName" placeholder="Mina" required />
              </label>
              <label>
                Access code
                <input className="field" name="accessCode" placeholder="mina" required />
              </label>
              <label>
                Year group
                <input className="field" name="yearGroup" defaultValue="Year 5" />
              </label>
              <button className="ribbon" type="submit">Add child</button>
            </form>
          </div>
        </section>

        <header className="parent-head">
          <div>
            <h1 id="parent-title" className="parent-head__title">
              How <span style={{ color: "var(--forest-green)" }}>this week</span> moved.
            </h1>
            <p>
              Descriptive snapshot of recent practice — no scores or grades, just where words sit and which ones moved.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="ribbon" href={`/parent/words/new?learnerId=${encodeURIComponent(learnerId)}`}>
              <Plus size={18} aria-hidden="true" />
              Add vocabulary
            </Link>
            <Link className="ribbon ribbon--ghost" href="/parent/spelling/new">
              <Plus size={18} aria-hidden="true" />
              Add spelling
            </Link>
          </div>
        </header>

        {/* Section: This week */}
        <section className="dash-section" aria-labelledby="this-week">
          <header className="section-head">
            <span className="section-head__label">This week</span>
            <h2 id="this-week" className="section-head__title">
              Quiet progress, with a few words drifting.
            </h2>
            <p className="section-head__sub">
              {dashboard.totalWords} active words; {dashboard.completeWords} ready for practice.
              The mastery snapshot is the deck&apos;s overall posture, not a grade.
            </p>
          </header>

          <div className="bento-grid">
            <div className="bento col-4 bento--accent">
              <span className="bento__eyebrow">Mastery snapshot</span>
              <h3>Where vocabulary sits</h3>
              <ProgressDistribution
                buckets={vocabularyBuckets}
                ariaLabel="Vocabulary mastery distribution"
              />
            </div>

            <div className="bento col-4">
              <span className="bento__eyebrow">Spelling snapshot</span>
              <h3>Where spellings sit</h3>
              <ProgressDistribution
                buckets={spellingBuckets}
                ariaLabel="Spelling progress distribution"
              />
            </div>

            <div className="bento col-4">
              <span className="bento__eyebrow">
                Rounds this week <DemoTag />
              </span>
              <h3>Streak placeholder</h3>
              <RoundsTimelineDemo />
              <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 13, color: "var(--steel-secondary)" }}>
                Daily round counts will land here once the timeline aggregator is wired up.
              </p>
            </div>

            <div className="bento col-4">
              <span className="bento__eyebrow">Latest session</span>
              <h3>Time on practice <DemoTag /></h3>
              <div className="bento-stats">
                <div className="bento-stats__row">
                  <span>Questions</span>
                  <strong>{dashboard.latestSession?.actualQuestionCount ?? 0}</strong>
                </div>
                <div className="bento-stats__row">
                  <span>Hint requests</span>
                  <strong>—</strong>
                </div>
                <div className="bento-stats__row">
                  <span>Ready words</span>
                  <strong>{dashboard.completeWords}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section: Still working on it */}
        <section className="dash-section" aria-labelledby="still-working">
          <header className="section-head">
            <span className="section-head__label">Still working on it</span>
            <h2 id="still-working" className="section-head__title">
              {stillWorking.length > 0
                ? `${stillWorking.length} words sit in Needs work or Building.`
                : "Nothing flagged for focus right now."}
            </h2>
            <p className="section-head__sub">
              The current selector uses recent attempts, recovery debt, recall decay, and confidence.
            </p>
          </header>

          {stillWorking.length > 0 ? (
            <div className="bento col-12">
              <table className="word-table">
                <thead>
                  <tr>
                    <th>Word</th>
                    <th>Mastery</th>
                    <th>Attempts</th>
                    <th>Correct</th>
                    <th>Wrong</th>
                    <th>Why it&apos;s here</th>
                  </tr>
                </thead>
                <tbody>
                  {stillWorking.map((word) => {
                    const colour = word.masteryColour ?? "yellow";
                    return (
                      <tr key={word.id}>
                        <td className="cell-word">{word.word}</td>
                        <td>
                          <span className={`mastery-mini ${MASTERY_KEY[colour]}`}>
                            <span className="mastery-mini__dot" aria-hidden="true" />
                            {MASTERY_LABELS[colour]}
                          </span>
                        </td>
                        <td className="cell-mono">{word.attemptCount}</td>
                        <td className="cell-mono">{word.correctCount}</td>
                        <td className="cell-mono">{word.wrongCount}</td>
                        <td className="dim">{word.definition ?? "Needs definition"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-state">No words sitting in needs-work or building yet.</p>
          )}
        </section>

        {/* Section: Next round */}
        <section className="dash-section" aria-labelledby="next-round">
          <header className="section-head">
            <span className="section-head__label">Next round</span>
            <h2 id="next-round" className="section-head__title">
              What&apos;s queued for tomorrow.
            </h2>
            <p className="section-head__sub">
              Defne picks {nextRound?.targetQuestionCount ?? 12} words automatically based on the queue.
              Manual swap controls are <DemoTag /> for now.
            </p>
          </header>

          <div className="bento-grid">
            <div className="bento col-8">
              <span className="bento__eyebrow">Tomorrow&apos;s round · {todayLabel}</span>
              <h3>{nextRound?.targetQuestionCount ?? 0} words queued</h3>
              {nextRound && nextRound.words.length > 0 ? (
                <ul className="queue-list">
                  {nextRound.words.slice(0, 12).map((w) => (
                    <li key={w.id} className="queue-row">
                      <span className="queue-row__word">{w.word}</span>
                      {w.masteryColour ? (
                        <span className={`mastery-mini ${MASTERY_KEY[w.masteryColour]}`}>
                          <span className="mastery-mini__dot" aria-hidden="true" />
                          {MASTERY_LABELS[w.masteryColour]}
                        </span>
                      ) : (
                        <span className="mastery-mini" style={{ background: "rgba(31,41,55,0.06)", color: "var(--steel-secondary)" }}>
                          <span className="mastery-mini__dot" aria-hidden="true" style={{ background: "rgba(31,41,55,0.20)" }} />
                          Not started
                        </span>
                      )}
                      <span className="queue-row__why">
                        {w.selectionReason.label}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No round queued yet.</p>
              )}
            </div>

            <div className="bento col-4 bento--accent">
              <span className="bento__eyebrow">Adjust the queue</span>
              <h3>Swap or pause</h3>
              <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55, color: "var(--steel-secondary)" }}>
                Pause stressful words or pull from a school list. Defne keeps the round at 12 words
                with three comeback spaces for stable and mastered words.
              </p>
              <form action={setNextRoundMixAction} className="queue-mix-form">
                <input type="hidden" name="learnerId" value={learnerId} />
                <label>
                  <span>Not started</span>
                  <input
                    type="number"
                    name="nextRoundNew"
                    min="0"
                    max="12"
                    defaultValue={dashboard.nextRoundMix.new}
                  />
                </label>
                <label>
                  <span>Mistake recovery</span>
                  <input
                    type="number"
                    name="nextRoundRecovery"
                    min="0"
                    max="12"
                    defaultValue={dashboard.nextRoundMix.recovery}
                  />
                </label>
                <label>
                  <span>Review</span>
                  <input
                    type="number"
                    name="nextRoundReview"
                    min="0"
                    max="12"
                    defaultValue={dashboard.nextRoundMix.review}
                  />
                </label>
                <label>
                  <span>Reliable</span>
                  <input
                    type="number"
                    name="nextRoundStable"
                    min="0"
                    max="12"
                    defaultValue={dashboard.nextRoundMix.stable}
                  />
                </label>
                <button className="button-secondary" type="submit">Save mix</button>
              </form>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Link className="ribbon" href={`/parent/words/new?learnerId=${encodeURIComponent(learnerId)}`}>
                  <Plus size={16} aria-hidden="true" />
                  Add vocabulary
                </Link>
                <Link className="ribbon ribbon--ghost" href={`/parent/words?learnerId=${encodeURIComponent(learnerId)}`}>
                  <ListChecks size={16} aria-hidden="true" />
                  Open vocabulary
                </Link>
              </div>
            </div>

            <div className="bento col-4">
              <span className="bento__eyebrow">Question visuals</span>
              <h3>Image cues</h3>
              <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55, color: "var(--steel-secondary)" }}>
                Choose whether image cues are generated for new vocabulary and where approved images appear.
              </p>
              <form action={setVisualCuesAction} className="visual-toggle-form">
                <input type="hidden" name="learnerId" value={learnerId} />
                <label className="visual-placement">
                  <input
                    type="checkbox"
                    name="visualCueGeneration"
                    defaultChecked={dashboard.visualCueGenerationEnabled}
                  />
                  <span>
                    <strong>Draft image previews</strong>
                    <small>Generate Gemini image previews when adding a new vocabulary word.</small>
                  </span>
                </label>
                <label className="visual-placement">
                  <input
                    type="checkbox"
                    name="visualCueLearnCards"
                    defaultChecked={dashboard.visualCuePreferences.learnCards}
                  />
                  <span>
                    <strong>Step 1 · learn cards</strong>
                    <small>Show images while the child studies the word and examples.</small>
                  </span>
                </label>
                <label className="visual-placement">
                  <input
                    type="checkbox"
                    name="visualCueMeaningQuestions"
                    defaultChecked={dashboard.visualCuePreferences.meaningQuestions}
                  />
                  <span>
                    <strong>Step 2 · meaning choices</strong>
                    <small>Show images beside “what does this word mean?” questions.</small>
                  </span>
                </label>
                <label className="visual-placement">
                  <input
                    type="checkbox"
                    name="visualCueContextQuestions"
                    defaultChecked={dashboard.visualCuePreferences.contextQuestions}
                  />
                  <span>
                    <strong>Step 3 · fill the sentence</strong>
                    <small>Show images beside sentence-completion practice.</small>
                  </span>
                </label>
                <p className="visual-toggle-summary">
                  {dashboard.visualCueGenerationEnabled
                    ? "New vocabulary can include draft image previews."
                    : "New vocabulary generation is text-only by default."}
                  {" "}
                  {dashboard.visualCuesEnabled ? "Approved images are enabled for selected child steps." : "Approved images are off for child practice."}
                </p>
                <button className="ribbon ribbon--ghost" type="submit">
                  Save setting
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="dash-section" aria-labelledby="word-heatmap">
          <header className="section-head">
            <span className="section-head__label">Word heatmap</span>
            <h2 id="word-heatmap" className="section-head__title">
              Every word, at a glance.
            </h2>
            <p className="section-head__sub">
              {allWords.length} words in the deck. Each square is one word —
              hover to see its history, paginate to walk the whole list.
            </p>
          </header>
          <div className="bento col-12">
            <WordHeatmap
              words={allWords}
              page={heatmapPage}
              pageSize={HEATMAP_PAGE_SIZE}
              variant="parent"
              basePath={`/parent?learnerId=${encodeURIComponent(learnerId)}`}
              detailQuery={`?learnerId=${encodeURIComponent(learnerId)}`}
            />
          </div>
        </section>

        {dashboard.latestRound ? (
          <section className="dash-section" aria-labelledby="round-evidence">
            <header className="section-head">
              <span className="section-head__label">Latest round evidence</span>
              <h2 id="round-evidence" className="section-head__title">
                What this round actually showed.
              </h2>
              <p className="section-head__sub">{dashboard.latestRound.explanation}</p>
            </header>
            <div className="bento col-12">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                <RoundList title="First-attempt secure" items={dashboard.latestRound.firstAttemptSecureWords} />
                <RoundList title="Completed with recovery" items={dashboard.latestRound.eventuallyCorrectWords} />
                <RoundList title="Near review" items={dashboard.latestRound.nearReviewWords} />
              </div>
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}

function RoundsTimelineDemo() {
  const days = [
    { day: "Mon", val: 12 },
    { day: "Tue", val: 14 },
    { day: "Wed", val: 0 },
    { day: "Thu", val: 11 },
    { day: "Fri", val: 13 },
    { day: "Sat", val: 0 },
    { day: "Sun", val: 14 },
  ];
  const max = 16;
  return (
    <div className="rounds-timeline" aria-label="Rounds timeline (demo)">
      {days.map((d) => {
        const skip = d.val === 0;
        return (
          <div key={d.day} className="rounds-timeline__day">
            <span
              className={`rounds-timeline__bar${skip ? " is-skip" : ""}`}
              style={skip ? undefined : { height: `${(d.val / max) * 60 + 8}px` }}
              aria-label={skip ? `${d.day}: skipped` : `${d.day}: ${d.val} words`}
            />
            <span className="rounds-timeline__val">{skip ? "—" : d.val}</span>
            <span className="rounds-timeline__label">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

function RoundList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <span className="bento__eyebrow">{title}</span>
      {items.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "grid", gap: 4 }}>
          {items.slice(0, 6).map((item) => (
            <li
              key={item}
              style={{
                fontFamily: "var(--font-editorial)",
                fontStyle: "italic",
                fontSize: "0.95rem",
                color: "var(--graphite-ink)",
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--muted-slate)",
            margin: "8px 0 0",
          }}
        >
          None.
        </p>
      )}
    </div>
  );
}

function DemoTag() {
  return <span className="demo-tag" title="Backend hookup pending">demo</span>;
}
