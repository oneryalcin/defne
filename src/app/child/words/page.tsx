import Link from "next/link";
import { WordHeatmap } from "@/components/WordHeatmap";
import { getParentWords } from "@/lib/db/repository";

const HEATMAP_PAGE_SIZE = 120;

type SearchParams = Promise<{ p?: string }> | { p?: string };

export const dynamic = "force-dynamic";

export default async function ChildWordsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const allWords = getParentWords();
  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as {
    p?: string;
  };
  const heatmapPage = Math.max(
    1,
    parseInt(resolvedSearchParams.p ?? "1", 10) || 1,
  );

  return (
    <main className="spread">
      <article
        className="book-page child-heatmap-page"
        aria-labelledby="child-heatmap"
      >
        <span className="folio">Your words so far</span>
        <header className="child-heatmap-page__header">
          <span className="cover-chapter">Your words so far</span>
          <h1 id="child-heatmap" className="cover-title child-heatmap-page__title">
            A field of <span className="accent">words</span> you have met.
          </h1>
          <Link className="ribbon ribbon--ghost" href="/child">
            Back to today
          </Link>
        </header>
        <div className="child-heatmap-page__body">
          <WordHeatmap
            words={allWords}
            page={heatmapPage}
            pageSize={HEATMAP_PAGE_SIZE}
            variant="child"
            basePath="/child/words"
          />
        </div>
      </article>
    </main>
  );
}
