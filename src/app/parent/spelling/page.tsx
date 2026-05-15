import Link from "next/link";
import { Plus } from "lucide-react";
import { ParentSpellingList } from "@/components/parent/ParentSpellingList";
import {
  getParentSpellingItems,
  listAvailableSpellingItemsForLearner
} from "@/lib/db/spellingRepository";
import { listLearners, resolveSelectedLearnerId } from "@/lib/db/learners";

type SearchParams = Promise<{ q?: string; learnerId?: string }>;

export const dynamic = "force-dynamic";

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
  const learnerName = selectedLearner?.displayName ?? "this child";

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

      <ParentSpellingList
        items={items}
        libraryItems={libraryItems}
        initialSearchQuery={initialQuery}
        learnerId={learnerId}
        learnerName={learnerName}
      />
    </main>
  );
}
