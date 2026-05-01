import Link from "next/link";
import { BookOpen } from "lucide-react";
import { getSessionSummary } from "@/lib/db/repository";
import { PencilMap } from "@/components/PencilMap";

export const dynamic = "force-dynamic";

const MAP_LAYOUT = [
  { x: 110, y: 296 },
  { x: 230, y: 274 },
  { x: 350, y: 252 },
  { x: 470, y: 230 },
  { x: 590, y: 196 },
  { x: 700, y: 130 },
];

export default async function SummaryPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const summary = getSessionSummary(sessionId);

  const today = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  const secure = summary.round?.firstAttemptSecureWords ?? [];
  const recovered = [
    ...(summary.round?.eventuallyCorrectWords ?? []),
    ...(summary.round?.revealAndMoveOnWords ?? []),
  ];
  const near = summary.round?.nearReviewWords ?? summary.revisitTomorrow ?? [];

  // Buckets can overlap (e.g. a word can be both 'recovered' and
  // 'nearReview'). Dedupe with a strongest-state-wins precedence so the
  // word only appears once on the legend and the SVG.
  const stateBy = new Map<string, "done" | "current" | "locked">();
  const noteBy = new Map<string, string>();
  for (const w of secure.slice(0, 2)) {
    stateBy.set(w, "done");
    noteBy.set(w, "Secure today.");
  }
  for (const w of recovered.slice(0, 1)) {
    if (stateBy.get(w) === "done") continue;
    stateBy.set(w, "current");
    noteBy.set(w, "Recovered after a miss — back tomorrow.");
  }
  for (const w of near.slice(0, 2)) {
    if (stateBy.has(w)) continue;
    stateBy.set(w, "locked");
    noteBy.set(w, "Needs another pass.");
  }
  const journey = [...stateBy.entries()].map(([word, state]) => ({
    word,
    state,
    note: noteBy.get(word) ?? "",
  }));

  const stops = journey.slice(0, 6).map((entry, idx) => ({
    word: entry.word,
    state: entry.state,
    x: MAP_LAYOUT[idx]?.x ?? 100 + idx * 110,
    y: MAP_LAYOUT[idx]?.y ?? 280,
  }));

  return (
    <main className="spread">
      <article className="book-page end-spread" aria-labelledby="end-title">
        <span className="folio">End of round · {today}</span>
        <span className="cover-chapter">The path so far</span>
        <h1 id="end-title" className="end-headline">
          {secure.length > 0
            ? "A small step today, a clearer view tomorrow."
            : "We’ll come back to these tomorrow."}
        </h1>

        <p className="cover-lede">
          {summary.round?.explanation ??
            "What moved forward in this session, and what should come back tomorrow."}
        </p>

        {stops.length > 0 ? (
          <div className="end-landscape">
            <PencilMap stops={stops} caption="Story map of the round" />
          </div>
        ) : null}

        {journey.length > 0 ? (
          <ul className="story-legend">
            {journey.map((entry) => (
              <li
                key={`${entry.state}-${entry.word}`}
                className={`story-legend__item is-${entry.state}`}
              >
                <span className="story-legend__word">{entry.word}</span>
                <span className="story-legend__note">{entry.note}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No round details to summarise.</p>
        )}

        <footer className="page-actions">
          <span className="page-actions__leader">Close the book.</span>
          <div style={{ display: "flex", gap: 14 }}>
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
