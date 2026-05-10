import Link from "next/link";
import { SpellingHeatmap } from "@/components/SpellingHeatmap";
import { getChildSpellingWords } from "@/lib/db/spellingRepository";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 140;

type SearchParams = Promise<{ p?: string }> | { p?: string };

export default async function ChildSpellingWordsPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const params = (await Promise.resolve(searchParams ?? {})) as { p?: string };
  const page = Math.max(1, parseInt(params.p ?? "1", 10) || 1);
  const words = getChildSpellingWords();

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
