import Link from "next/link";
import { Plus } from "lucide-react";
import { ParentVocabularyList } from "@/components/parent/ParentVocabularyList";
import { getParentWords } from "@/lib/db/repository";
import { listAvailableVocabularyForLearner, listLearners, resolveSelectedLearnerId } from "@/lib/db/learners";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; learnerId?: string }>;

export default async function WordsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const learnerId = resolveSelectedLearnerId(resolvedSearchParams.learnerId);
  const learners = listLearners();
  const selectedLearner = learners.find((learner) => learner.id === learnerId);
  const words = getParentWords(learnerId);
  const libraryWords = listAvailableVocabularyForLearner(learnerId);
  const initialQuery = resolvedSearchParams.q ?? "";
  const learnerName = selectedLearner?.displayName ?? "this child";

  return (
    <main className="page">
      <section className="page-title">
        <h1>Vocabulary list</h1>
        <p>
          Assigned words for {selectedLearner?.displayName ?? "the selected child"}. Seed and parent-added words stay in the shared library.
        </p>
      </section>

      <div className="action-row">
        {learners.map((learner) => (
          <Link
            key={learner.id}
            className={learner.id === learnerId ? "button" : "button-secondary"}
            href={`/parent/words?learnerId=${encodeURIComponent(learner.id)}`}
          >
            {learner.displayName}
          </Link>
        ))}
        <Link className="button" href={`/parent/words/new?learnerId=${encodeURIComponent(learnerId)}`}>
          <Plus size={18} />
          Add vocabulary
        </Link>
      </div>

      <ParentVocabularyList
        words={words}
        libraryWords={libraryWords}
        initialSearchQuery={initialQuery}
        learnerId={learnerId}
        learnerName={learnerName}
      />
    </main>
  );
}
