import Image from "next/image";
import Link from "next/link";
import { getSessionView } from "@/lib/db/repository";
import { QuestionForm } from "@/components/QuestionForm";
import { MasteryBadge } from "@/components/MasteryBadge";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const view = getSessionView(sessionId);
  const percent = view.totalQuestions > 0 ? Math.round(((view.questionNumber - 1) / view.totalQuestions) * 100) : 0;

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
          <div className="progress-track" aria-label={`Question ${view.questionNumber} of ${view.totalQuestions}`}>
            <div className="progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <p className="metric-label">
            Question {view.questionNumber} of {view.totalQuestions}
          </p>
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
          {view.word.spellingNote ? <div className="hint-box">Spelling note: {view.word.spellingNote}</div> : null}
        </aside>
      </section>
    </main>
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
