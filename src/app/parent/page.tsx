import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, BookMarked, ListChecks, Plus, SpellCheck } from "lucide-react";
import { getParentDashboard } from "@/lib/db/repository";
import { MasteryBadge } from "@/components/MasteryBadge";

export const dynamic = "force-dynamic";

export default function ParentDashboardPage() {
  const dashboard = getParentDashboard();

  return (
    <main className="page">
      <section className="page-title">
        <h1>Parent dashboard</h1>
        <p>Evidence from the saved practice history: weak words, spelling traps, due reviews, and close-to-green words.</p>
      </section>

      <section className="mission-strip">
        <div className="metric-strip">
          <span className="metric-label">Total words</span>
          <span className="metric-value">{dashboard.totalWords}</span>
        </div>
        <div className="metric-strip">
          <span className="metric-label">Complete entries</span>
          <span className="metric-value">{dashboard.completeWords}</span>
        </div>
        <div className="metric-strip">
          <span className="metric-label">Latest session</span>
          <span className="metric-value">{dashboard.latestSession?.actualQuestionCount ?? 0}</span>
        </div>
      </section>

      <div className="action-row">
        <Link className="button" href="/parent/words/new">
          <Plus size={18} />
          Add word
        </Link>
        <Link className="button-secondary" href="/parent/import">
          <ListChecks size={18} />
          Paste batch
        </Link>
      </div>

      {dashboard.latestRound ? (
        <section className="panel round-parent-panel">
          <ListChecks size={24} />
          <h2>Latest round evidence</h2>
          <p>{dashboard.latestRound.explanation}</p>
          <RoundMasteryExplainer round={dashboard.latestRound} />
          <div className="round-evidence-grid">
            <EvidenceList title="First-attempt secure" items={dashboard.latestRound.firstAttemptSecureWords} />
            <EvidenceList title="Completed with recovery" items={dashboard.latestRound.eventuallyCorrectWords} />
            <EvidenceList title="Near review" items={dashboard.latestRound.nearReviewWords} />
            <EvidenceList title="Spelling still weak" items={dashboard.latestRound.spellingStillWeakWords} />
          </div>
          <div className="round-detail-grid">
            <SelectionReasonList reasons={dashboard.latestRound.selectionReasons ?? []} />
            <MistakeEvidenceList evidence={dashboard.latestRound.mistakeEvidence ?? []} />
          </div>
        </section>
      ) : null}

      <section className="dashboard-grid">
        <Panel title="Red and orange words" icon={<AlertTriangle size={24} />}>
          <WordList words={dashboard.redOrangeWords} />
        </Panel>

        <Panel title="Repeated spelling mistakes" icon={<SpellCheck size={24} />}>
          {dashboard.spellingMistakes.length > 0 ? (
            <ul className="compact-list">
              {dashboard.spellingMistakes.map((item) => (
                <li key={item.word}>
                  <span>
                    <strong>{item.word}</strong>
                    <br />
                    {item.note ?? "No spelling note yet"}
                  </span>
                  <span>{item.mistakes}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">No spelling mistakes recorded yet.</p>
          )}
        </Panel>

        <Panel title="Due or weak review words" icon={<BookMarked size={24} />}>
          <WordList words={dashboard.dueWords} />
        </Panel>

        <Panel title="Close to green" icon={<ListChecks size={24} />}>
          <WordList words={dashboard.closeToGreen} />
        </Panel>
      </section>
    </main>
  );
}

function EvidenceList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <span className="metric-label">{title}</span>
      {items.length > 0 ? (
        <ul className="mini-list">
          {items.slice(0, 6).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-state compact-empty">None yet.</p>
      )}
    </div>
  );
}

function RoundMasteryExplainer({ round }: { round: NonNullable<ReturnType<typeof getParentDashboard>["latestRound"]> }) {
  const recoveryCount = round.eventuallyCorrectWords.length + round.revealAndMoveOnWords.length;
  return (
    <div className="round-explainer" aria-label="Secure versus recovery explanation">
      <div>
        <span className="metric-label">Secure</span>
        <strong>{round.firstAttemptSecureWords.length}</strong>
        <p>Correct first try in meaning and sentence use.</p>
      </div>
      <div>
        <span className="metric-label">Recovery</span>
        <strong>{recoveryCount}</strong>
        <p>Finished after a miss or reveal. Useful effort, not secure mastery yet.</p>
      </div>
      <div>
        <span className="metric-label">Near review</span>
        <strong>{round.nearReviewWords.length}</strong>
        <p>Comes back soon until the recent mistake evidence clears.</p>
      </div>
    </div>
  );
}

function SelectionReasonList({ reasons }: { reasons: NonNullable<ReturnType<typeof getParentDashboard>["latestRound"]>["selectionReasons"] }) {
  return (
    <div>
      <span className="metric-label">Why these words were picked</span>
      {reasons && reasons.length > 0 ? (
        <ul className="evidence-list">
          {reasons.slice(0, 8).map((reason) => (
            <li key={reason.wordId}>
              <strong>{reason.word}</strong>
              <span>{reason.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state compact-empty">Selection reasons were not stored for this round.</p>
      )}
    </div>
  );
}

function MistakeEvidenceList({ evidence }: { evidence: NonNullable<ReturnType<typeof getParentDashboard>["latestRound"]>["mistakeEvidence"] }) {
  return (
    <div>
      <span className="metric-label">Mistake count</span>
      {evidence && evidence.length > 0 ? (
        <ul className="evidence-list">
          {evidence.slice(0, 8).map((item) => (
            <li key={item.word}>
              <strong>{item.word}</strong>
              <span>
                {item.totalMistakes} total · meaning {item.meaningMistakes} · context {item.contextMistakes}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state compact-empty">No mistakes in the latest round.</p>
      )}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="panel">
      {icon}
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function WordList({ words }: { words: ReturnType<typeof getParentDashboard>["redOrangeWords"] }) {
  if (words.length === 0) {
    return <p className="empty-state">Nothing to show yet.</p>;
  }

  return (
    <ul className="compact-list">
      {words.map((word) => (
        <li key={word.id}>
          <span>
            <strong>{word.word}</strong>
            <br />
            {word.definition ?? "Needs definition"}
          </span>
          {word.masteryColour ? <MasteryBadge colour={word.masteryColour} /> : null}
        </li>
      ))}
    </ul>
  );
}
