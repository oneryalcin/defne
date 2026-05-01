import { Target } from "lucide-react";
import { startMissionAction } from "@/app/actions";
import { getMissionPreview } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default function ChildPage() {
  const preview = getMissionPreview(8);
  const groups = groupPreviewWords(preview.words);

  return (
    <main className="page">
      <section className="two-column child-round-layout">
        <div className="mission-panel round-preview-panel">
          <div className="page-title">
            <h1>Today&apos;s word round</h1>
            <p>Learn a small set first, then prove meaning and usage. Mistakes get repaired without pretending they were first-try recall.</p>
          </div>

          <div className="mission-strip">
            <div className="metric-strip">
              <span className="metric-label">Words</span>
              <span className="metric-value">{preview.targetQuestionCount}</span>
            </div>
            <div className="metric-strip">
              <span className="metric-label">Time</span>
              <span className="metric-value">10-15m</span>
            </div>
            <div className="metric-strip">
              <span className="metric-label">Focus</span>
              <span className="metric-value">Round</span>
            </div>
          </div>

          <section className="round-brief" aria-label="Today&apos;s round words">
            <div className="round-brief-header">
              <span className="metric-label">Today&apos;s cards</span>
              <strong>{preview.targetQuestionCount}</strong>
            </div>
            {groups.map((group) => (
              <div className="word-cluster" key={group.title}>
                <div className="word-cluster-header">
                  <div>
                    <strong>{group.title}</strong>
                    <p>{group.detail}</p>
                  </div>
                  <span>{group.words.length} words</span>
                </div>
                <ul className="word-chip-grid">
                  {group.words.map((word) => (
                    <li className="word-chip" key={word.id}>
                      <strong>{word.word}</strong>
                      <span>{word.weakestDimension} focus</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <form action={startMissionAction} className="round-start-row">
            <button className="button button-large" type="submit">
              <Target size={18} />
              Start round
            </button>
          </form>
        </div>

        <aside className="round-map-panel" aria-label="Round path">
          <h2>How this round works</h2>
          <ol className="round-path">
            <li>
              <span>1</span>
              <div>
                <strong>Study each card twice</strong>
                <p>The word list stays visible so you can revisit anything before the questions start.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Match meanings</strong>
                <p>Missed words return in a repair pass instead of ending the round early.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Complete sentences</strong>
                <p>Clean answers are counted separately from recovered answers.</p>
              </div>
            </li>
          </ol>
        </aside>
      </section>
    </main>
  );
}

type PreviewWord = ReturnType<typeof getMissionPreview>["words"][number];
type PreviewReason = PreviewWord["selectionReason"]["reason"];

const ROUND_PREVIEW_GROUPS: Array<{
  title: string;
  detail: string;
  reasons: PreviewReason[];
}> = [
  {
    title: "Comeback practice",
    detail: "Words from recent misses or supported answers.",
    reasons: ["near_review", "revealed_recently", "recovered_after_miss"]
  },
  {
    title: "New builders",
    detail: "Words that still need solid first evidence.",
    reasons: ["new_or_red"]
  },
  {
    title: "Review proof",
    detail: "Words ready for another clean check.",
    reasons: ["due_review", "near_green", "priority"]
  }
];

function groupPreviewWords(words: PreviewWord[]): Array<{ title: string; detail: string; words: PreviewWord[] }> {
  return ROUND_PREVIEW_GROUPS.map((group) => ({
    title: group.title,
    detail: group.detail,
    words: words.filter((word) => group.reasons.includes(word.selectionReason.reason))
  })).filter((group) => group.words.length > 0);
}
