import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getSessionSummary } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export default async function SummaryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const summary = getSessionSummary(sessionId);

  const secure = summary.round?.firstAttemptSecureWords ?? [];
  const recovered = summary.round?.eventuallyCorrectWords ?? [];
  const revealed = summary.round?.revealAndMoveOnWords ?? [];
  const near = summary.round?.nearReviewWords ?? summary.revisitTomorrow ?? [];
  const movedForward = recovered.filter((word) => !revealed.includes(word));
  const needsAnotherLook = unique([...revealed, ...near]).filter(
    (word) => !movedForward.includes(word),
  );
  const held = secure.filter((word) => !movedForward.includes(word) && !needsAnotherLook.includes(word));
  const hasMovement = movedForward.length > 0 || needsAnotherLook.length > 0 || held.length > 0;

  return (
    <main className="spread">
      <article className="book-page end-spread" aria-labelledby="end-title">
        <h1 id="end-title" className="end-headline">Nice work today.</h1>

        {hasMovement ? (
          <section className="round-movement" aria-label="Round word movement">
            {movedForward.length > 0 ? (
              <SummaryBucket
                tone="up"
                title="Moved forward"
                words={movedForward}
              />
            ) : null}

            {needsAnotherLook.length > 0 ? (
              <SummaryBucket
                tone="down"
                title="Needs another look"
                words={needsAnotherLook}
              />
            ) : null}

            {held.length > 0 ? (
              <SummaryBucket
                tone="steady"
                title="Held"
                words={held}
              />
            ) : null}
          </section>
        ) : (
          <p className="empty-state">No round details to summarise.</p>
        )}

        <footer className="page-actions">
          <div className="end-actions">
            <Link className="ribbon" href="/child">
              <BookOpen size={18} aria-hidden="true" />
              Open another round
            </Link>
            <Link className="ribbon ribbon--ghost" href="/">
              Home
            </Link>
          </div>
        </footer>
      </article>
    </main>
  );
}

function SummaryBucket({
  tone,
  title,
  words,
}: {
  tone: "up" | "down" | "steady";
  title: string;
  words: string[];
}) {
  return (
    <section className={`summary-bucket summary-bucket--${tone}`}>
      <h2>{title}</h2>
      <ul>
        {words.map((word) => (
          <li key={`${tone}-${word}`}>
            <span>{word}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
