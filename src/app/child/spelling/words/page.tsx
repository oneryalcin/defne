import Link from "next/link";
import { cookies } from "next/headers";
import { SpellingHeatmap } from "@/components/SpellingHeatmap";
import { getChildSpellingWords } from "@/lib/db/spellingRepository";
import { getLearnerAccessByCode, learnerExists } from "@/lib/db/learners";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 140;

type SearchParams = Promise<{ p?: string }>;

async function currentChildLearnerId(): Promise<string | null> {
  const jar = await cookies();
  const current = parsePilotSession(jar.get(PILOT_SESSION_COOKIE)?.value);
  if (!current || current.role !== "child") return null;
  if (current.learnerId && learnerExists(current.learnerId)) return current.learnerId;
  return getLearnerAccessByCode(current.accessCode)?.learnerId ?? null;
}

export default async function ChildSpellingWordsPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const page = Math.max(1, parseInt(params.p ?? "1", 10) || 1);
  const learnerId = await currentChildLearnerId();
  const words = getChildSpellingWords(learnerId ?? undefined);

  return (
    <main className="spread">
      <article className="book-page child-heatmap-page" aria-labelledby="child-spelling-words-title">
        <span className="folio">Your spellings so far</span>
        <section className="child-heatmap-page__header">
          <span className="cover-chapter">Your spellings so far</span>
          <h1 id="child-spelling-words-title" className="cover-title child-heatmap-page__title">
            A field of spellings you have met.
          </h1>
          <div className="cover-actions">
            <Link className="ribbon" href="/child/spelling">
              Back to spelling
            </Link>
            <Link className="ribbon ribbon--ghost" href="/child">
              Back to today
            </Link>
          </div>
        </section>
        <section className="child-heatmap-page__body">
          <SpellingHeatmap words={words} page={page} pageSize={PAGE_SIZE} basePath="/child/spelling/words" />
        </section>
      </article>
    </main>
  );
}
