import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, RotateCcw, SpellCheck } from "lucide-react";
import { getSessionSummary } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function SummaryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const summary = getSessionSummary(sessionId);

  return (
    <main className="page">
      <section className="page-title">
        <h1>Round summary</h1>
        <p>{summary.round?.explanation ?? "What moved forward in this session, and what should come back tomorrow."}</p>
      </section>

      {summary.round ? (
        <section className="panel round-parent-panel">
          <h2>What the round means</h2>
          <div className="round-explainer">
            <div>
              <span className="metric-label">Secure</span>
              <strong>{summary.round.firstAttemptSecureWords.length}</strong>
              <p>Correct on the first try in meaning and sentence use.</p>
            </div>
            <div>
              <span className="metric-label">Recovered</span>
              <strong>{summary.round.eventuallyCorrectWords.length + summary.round.revealAndMoveOnWords.length}</strong>
              <p>Finished after a miss or reveal, so it should come back soon.</p>
            </div>
            <div>
              <span className="metric-label">Near review</span>
              <strong>{summary.round.nearReviewWords.length}</strong>
              <p>These words need another clean pass.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <SummaryPanel
          icon={<CheckCircle2 size={24} />}
          title="Words improved"
          empty="No words improved yet. The attempt history is still useful."
          items={summary.wordsImproved ?? []}
        />
        <SummaryPanel
          icon={<SpellCheck size={24} />}
          title="Spelling traps"
          empty="No spelling traps in this mission."
          items={summary.spellingTraps ?? []}
        />
        <SummaryPanel
          icon={<RotateCcw size={24} />}
          title={summary.round ? "Near review" : "Revisit tomorrow"}
          empty="Nothing urgent to revisit."
          items={summary.revisitTomorrow ?? []}
        />
        {summary.round ? (
          <SummaryPanel
            icon={<CheckCircle2 size={24} />}
            title="First-attempt secure"
            empty="No words were secure on both first attempts yet."
            items={summary.round.firstAttemptSecureWords}
          />
        ) : null}
      </section>

      <div className="action-row">
        <Link className="button" href="/child">
          Practise another round
        </Link>
        <Link className="button-secondary" href="/parent">
          Parent dashboard
        </Link>
      </div>
    </main>
  );
}

function SummaryPanel({
  icon,
  title,
  empty,
  items
}: {
  icon: ReactNode;
  title: string;
  empty: string;
  items: string[];
}) {
  return (
    <div className="panel">
      {icon}
      <h2>{title}</h2>
      {items.length > 0 ? (
        <ul className="compact-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">{empty}</p>
      )}
    </div>
  );
}
