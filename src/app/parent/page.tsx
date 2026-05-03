import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { setVisualCuesAction } from "@/app/actions";
import {
  getMissionPreview,
  getParentDashboard,
  getParentWords,
} from "@/lib/db/repository";
import type { MasteryColour } from "@/lib/types";
import { WordHeatmap } from "@/components/WordHeatmap";

const HEATMAP_PAGE_SIZE = 200;

export const dynamic = "force-dynamic";

const MASTERY_LABELS: Record<MasteryColour, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered",
};

const MASTERY_KEY: Record<MasteryColour, string> = {
  red: "is-red",
  orange: "is-orange",
  yellow: "is-yellow",
  light_green: "is-light_green",
  green: "is-green",
};

const DEMO_PATTERNS = [
  {
    code: "-ous endings",
    instances: 4,
    examples: [
      ["caut", "ius", "cautious"],
      ["cur", "ius", "curious"],
    ],
  },
  {
    code: "-ent / -ant",
    instances: 2,
    examples: [["persist", "ant", "persistent"]],
  },
];

const DEMO_DECAY = [
  { word: "eager", days: 11, from: "Mastered", to: "Reliable" },
  { word: "grateful", days: 14, from: "Mastered", to: "Nearly steady" },
  { word: "frequent", days: 9, from: "Reliable", to: "Nearly steady" },
];

type SearchParams = Promise<{ p?: string }> | { p?: string };

export default async function ParentDashboardPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const dashboard = getParentDashboard();
  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as {
    p?: string;
  };
  const heatmapPage = Math.max(1, parseInt(resolvedSearchParams.p ?? "1", 10) || 1);
  const nextRound = (() => {
    try {
      return getMissionPreview(12);
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
  const allWords = getParentWords();
  const distribution = countMastery(
    allWords
      .map((w) => w.masteryColour)
      .filter((c): c is MasteryColour => Boolean(c))
  );
  const untracked = allWords.filter((w) => !w.masteryColour).length;
  const distTotal = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;

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
            <span className="cover-chapter">Defne · pilot dashboard</span>
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
                <strong>Defne</strong>
                <span>Year 5 · British English</span>
              </span>
            </span>
          </div>
        </header>

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
            <Link className="ribbon" href="/parent/words/new">
              <Plus size={18} aria-hidden="true" />
              Add word
            </Link>
            <Link className="ribbon ribbon--ghost" href="/parent/import">
              <ListChecks size={18} aria-hidden="true" />
              Paste batch
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
              <h3>Where the deck sits</h3>
              <Distribution
                distribution={distribution}
                total={distTotal}
                untracked={untracked}
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
                  <span>Spelling diffs</span>
                  <strong>{dashboard.spellingMistakes.length}</strong>
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
              The lowest dimension drives what the next round practises. Per-dimension breakdown is a
              <DemoTag /> until meaning/usage/spelling are surfaced from word state.
            </p>
          </header>

          {stillWorking.length > 0 ? (
            <div className="bento col-12">
              <table className="word-table">
                <thead>
                  <tr>
                    <th>Word</th>
                    <th>Mastery</th>
                    <th>Meaning</th>
                    <th>Usage</th>
                    <th>Spelling</th>
                    <th>Why it&apos;s here</th>
                  </tr>
                </thead>
                <tbody>
                  {stillWorking.map((word) => {
                    const colour = word.masteryColour ?? "yellow";
                    const ratio = masteryRatio(colour);
                    return (
                      <tr key={word.id}>
                        <td className="cell-word">{word.word}</td>
                        <td>
                          <span className={`mastery-mini ${MASTERY_KEY[colour]}`}>
                            <span className="mastery-mini__dot" aria-hidden="true" />
                            {MASTERY_LABELS[colour]}
                          </span>
                        </td>
                        <td>
                          <DemoMeter colour={colour} ratio={ratio - 0.1} />
                        </td>
                        <td>
                          <DemoMeter colour={colour} ratio={ratio} />
                        </td>
                        <td>
                          <DemoMeter colour={colour} ratio={Math.max(0.2, ratio - 0.2)} />
                        </td>
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

        {/* Section: Repeated mistakes */}
        <section className="dash-section" aria-labelledby="repeated-mistakes">
          <header className="section-head">
            <span className="section-head__label">Repeated mistakes</span>
            <h2 id="repeated-mistakes" className="section-head__title">
              {dashboard.spellingMistakes.length > 0
                ? "Spelling residue worth surfacing."
                : "No spelling residue this week."}
            </h2>
            <p className="section-head__sub">
              Pattern detection is a <DemoTag /> — current data shows individual misses by word.
              The grouped view will replace this once the analyser ships.
            </p>
          </header>

          <div className="bento-grid">
            <div className="bento col-7">
              <span className="bento__eyebrow">Spelling residue</span>
              <h3>What slipped most</h3>
              {dashboard.spellingMistakes.length > 0 ? (
                <ul className="decay-list">
                  {dashboard.spellingMistakes.slice(0, 5).map((item) => (
                    <li key={item.word} className="decay-row">
                      <strong>{item.word}</strong>
                      <span className="decay-row__movement">
                        {item.note ?? "No spelling note yet"}
                      </span>
                      <span className="cell-mono">{item.mistakes} miss</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="spell-pat-list" aria-label="Spelling patterns (demo)">
                  {DEMO_PATTERNS.map((pat) => (
                    <li key={pat.code} className="spell-pat">
                      <div className="spell-pat__head">
                        <span className="spell-pat__code">{pat.code}</span>
                        <span className="spell-pat__count">
                          {pat.instances} instances · demo
                        </span>
                      </div>
                      <div className="spell-pat__examples">
                        {pat.examples.map(([prefix, wrong, full]) => (
                          <span key={full} className="spell-pat__ex">
                            <span>
                              {prefix}
                              <span className="letter-miss-inline">{wrong}</span>
                            </span>
                            <span aria-hidden="true">→</span>
                            <span>{full}</span>
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bento col-5">
              <span className="bento__eyebrow">
                Decay queue <DemoTag />
              </span>
              <h3>Drifted from earlier weeks</h3>
              <ul className="decay-list">
                {(dashboard.dueWords.length > 0
                  ? dashboard.dueWords.slice(0, 5).map((w) => ({
                      word: w.word,
                      days: 7,
                      from: MASTERY_LABELS[w.masteryColour ?? "yellow"],
                      to: MASTERY_LABELS["orange"],
                    }))
                  : DEMO_DECAY
                ).map((row) => (
                  <li key={row.word} className="decay-row">
                    <strong>{row.word}</strong>
                    <span className="decay-row__movement">
                      {row.from} → {row.to}
                    </span>
                    <span className="cell-mono">{row.days}d</span>
                  </li>
                ))}
              </ul>
              <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 13, color: "var(--steel-secondary)" }}>
                These return automatically over the next two rounds.
              </p>
            </div>
          </div>
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
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <Link className="ribbon" href="/parent/words/new">
                  <Plus size={16} aria-hidden="true" />
                  Add a word
                </Link>
                <Link className="ribbon ribbon--ghost" href="/parent/words">
                  <ListChecks size={16} aria-hidden="true" />
                  Open queue
                </Link>
              </div>
            </div>

            <div className="bento col-4">
              <span className="bento__eyebrow">Question visuals</span>
              <h3>Image cues</h3>
              <p style={{ margin: 0, fontFamily: "var(--font-body)", fontSize: 14, lineHeight: 1.55, color: "var(--steel-secondary)" }}>
                Choose where approved example images appear. Steps without images stay text-only.
              </p>
              <form action={setVisualCuesAction} className="visual-toggle-form">
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
                  {dashboard.visualCuesEnabled ? "Images are enabled for selected steps." : "Images are off for child practice."}
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
              basePath="/parent"
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
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 18,
                }}
              >
                <RoundList title="First-attempt secure" items={dashboard.latestRound.firstAttemptSecureWords} />
                <RoundList title="Completed with recovery" items={dashboard.latestRound.eventuallyCorrectWords} />
                <RoundList title="Near review" items={dashboard.latestRound.nearReviewWords} />
                <RoundList title="Spelling still weak" items={dashboard.latestRound.spellingStillWeakWords} />
              </div>
            </div>
          </section>
        ) : null}
      </article>
    </main>
  );
}

function Distribution({
  distribution,
  total,
  untracked,
}: {
  distribution: Record<MasteryColour, number>;
  total: number;
  untracked: number;
}) {
  const order: MasteryColour[] = ["red", "orange", "yellow", "light_green", "green"];
  const palette: Record<MasteryColour, string> = {
    red: "var(--mastery-red)",
    orange: "var(--mastery-orange)",
    yellow: "var(--mastery-yellow)",
    light_green: "var(--mastery-light)",
    green: "var(--mastery-green)",
  };
  return (
    <div className="dist">
      <div className="dist__bar" role="presentation">
        {untracked > 0 ? (
          <span
            className="dist__seg"
            style={{
              width: `${(untracked / (total + untracked)) * 100}%`,
              background: "rgba(31,41,55,0.18)",
              minWidth: 6,
            }}
          />
        ) : null}
        {order.map((colour) => {
          const ratio = (distribution[colour] / (total + untracked)) * 100;
          return (
            <span
              key={colour}
              className="dist__seg"
              style={{
                width: `${ratio}%`,
                background: palette[colour],
                minWidth: distribution[colour] > 0 ? 6 : 0,
              }}
            />
          );
        })}
      </div>
      <ul className="dist__legend">
        {untracked > 0 ? (
          <li>
            <span
              className="dist__dot"
              style={{ background: "rgba(31,41,55,0.18)" }}
            />
            <span className="dist__label">Not started</span>
            <span className="dist__count">{untracked}</span>
          </li>
        ) : null}
        {order.map((colour) => (
          <li key={colour}>
            <span
              className="dist__dot"
              style={{ background: palette[colour] }}
            />
            <span className="dist__label">{MASTERY_LABELS[colour]}</span>
            <span className="dist__count">{distribution[colour]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DemoMeter({
  colour,
  ratio,
}: {
  colour: MasteryColour;
  ratio: number;
}) {
  const safe = Math.max(0.08, Math.min(1, ratio));
  return (
    <div className={`mini-meter ${MASTERY_KEY[colour]}`} aria-label={`Demo meter ${Math.round(safe * 100)}%`}>
      <span />
      <span className="mini-meter__track">
        <span className="mini-meter__fill" style={{ width: `${Math.round(safe * 100)}%` }} />
      </span>
      <span className="mini-meter__val">{Math.round(safe * 100)}</span>
    </div>
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

function masteryRatio(colour: MasteryColour): number {
  switch (colour) {
    case "red":
      return 0.35;
    case "orange":
      return 0.55;
    case "yellow":
      return 0.7;
    case "light_green":
      return 0.85;
    case "green":
      return 0.95;
  }
}

function countMastery(colours: MasteryColour[]): Record<MasteryColour, number> {
  const dist: Record<MasteryColour, number> = {
    red: 0,
    orange: 0,
    yellow: 0,
    light_green: 0,
    green: 0,
  };
  for (const c of colours) dist[c] += 1;
  return dist;
}
