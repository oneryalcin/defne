import Image from "next/image";
import { Clock, Target } from "lucide-react";
import { startMissionAction } from "@/app/actions";
import { getMissionPreview } from "@/lib/db/repository";
import { MasteryBadge } from "@/components/MasteryBadge";

export const dynamic = "force-dynamic";

export default function ChildPage() {
  const preview = getMissionPreview(8);

  return (
    <main className="page">
      <section className="two-column">
        <div className="mission-panel">
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

          <ul className="focus-list" aria-label="Today&apos;s focus words">
            {preview.words.slice(0, 8).map((word) => (
              <li className="focus-item" key={word.id}>
                <div className="word-main">
                  <strong>{word.word}</strong>
                  <span>{word.weakestDimension} needs the most practice</span>
                </div>
                <MasteryBadge colour={word.masteryColour} />
              </li>
            ))}
          </ul>

          <form action={startMissionAction} className="action-row">
            <button className="button" type="submit">
              <Target size={18} />
              Start round
            </button>
            <span className="button-secondary" aria-label="Estimated time">
              <Clock size={18} />
              10-15 minutes
            </span>
          </form>
        </div>

        <div className="visual-frame">
          <Image
            src="/assets/visual-concepts/03-hint-mistake-recovery.png"
            alt="Pencil drawing vocabulary helper showing hints and recovery"
            width={1536}
            height={1024}
            priority
          />
        </div>
      </section>
    </main>
  );
}
