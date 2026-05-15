import Link from "next/link";
import { Plus } from "lucide-react";
import { ParentSpellingList } from "@/components/parent/ParentSpellingList";
import {
  getParentSpellingItems,
  listAvailableSpellingItemsForLearner
} from "@/lib/db/spellingRepository";
import { listLearners, resolveSelectedLearnerId } from "@/lib/db/learners";
import { assignSpellingItemAction, unassignSpellingItemAction } from "@/app/actions";

type SearchParams = Promise<{ q?: string; learnerId?: string }>;

export const dynamic = "force-dynamic";

function matchesSpellingQuery(
  item: {
    target: string;
    usageLabel?: string | null;
    teachingNote?: string | null;
  },
  normalizedQuery: string
) {
  if (!normalizedQuery) return true;
  return (
    item.target.toLocaleLowerCase("en-GB").includes(normalizedQuery) ||
    (item.usageLabel ?? "").toLocaleLowerCase("en-GB").includes(normalizedQuery) ||
    (item.teachingNote ?? "").toLocaleLowerCase("en-GB").includes(normalizedQuery)
  );
}

export default async function ParentSpellingPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const learnerId = resolveSelectedLearnerId(resolvedSearchParams.learnerId);
  const learners = listLearners();
  const selectedLearner = learners.find((learner) => learner.id === learnerId);
  const items = getParentSpellingItems(learnerId);
  const libraryItems = listAvailableSpellingItemsForLearner(learnerId);
  const initialQuery = resolvedSearchParams.q ?? "";
  const normalizedQuery = initialQuery.trim().toLocaleLowerCase("en-GB");
  const visibleLibraryItems = libraryItems.filter((item) => matchesSpellingQuery(item, normalizedQuery));

  return (
    <main className="page">
      <section className="page-title">
        <h1>Spelling words</h1>
        <p>Assigned spelling items for {selectedLearner?.displayName ?? "the selected child"}. Shared spelling items can be added per child.</p>
      </section>

      <div className="action-row">
        {learners.map((learner) => (
          <Link
            key={learner.id}
            className={learner.id === learnerId ? "button" : "button-secondary"}
            href={`/parent/spelling?learnerId=${encodeURIComponent(learner.id)}`}
          >
            {learner.displayName}
          </Link>
        ))}
        <Link className="button" href={`/parent/spelling/new?learnerId=${encodeURIComponent(learnerId)}`}>
          <Plus size={18} />
          Add spelling word
        </Link>
      </div>

      <ParentSpellingList items={items} initialSearchQuery={initialQuery} learnerId={learnerId} />

      <section className="page-title" style={{ marginTop: 32 }}>
        <h2>Shared spelling library</h2>
        <p>Add existing reviewed spelling items to {selectedLearner?.displayName ?? "this child"} without duplicating the library entry.</p>
      </section>
      <section className="word-grid">
        {visibleLibraryItems.length > 0 ? (
          visibleLibraryItems.map((item) => (
            <article className="word-row" key={`spelling-library-${item.id}`}>
              <div className="word-main">
                <strong>{item.target}</strong>
                <span>{item.teachingNote || "Pair shell only. Add teaching note and clean sentences before practice."}</span>
                <small>
                  {item.usageLabel || "no label"} · {item.promptCount} sentence{item.promptCount === 1 ? "" : "s"}
                </small>
              </div>
              {item.assigned ? (
                <form action={unassignSpellingItemAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button className="button-secondary library-word-button" type="submit">Pause for child</button>
                </form>
              ) : (
                <form action={assignSpellingItemAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button className="button library-word-button" type="submit">Add to child</button>
                </form>
              )}
            </article>
          ))
        ) : (
          <p className="empty-state" style={{ gridColumn: "1 / -1" }}>
            {initialQuery.trim()
              ? `No shared spelling items match "${initialQuery.trim()}".`
              : "No shared spelling items are available yet."}
          </p>
        )}
      </section>
    </main>
  );
}
