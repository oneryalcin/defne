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
