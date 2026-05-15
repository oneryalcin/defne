import Link from "next/link";
import { Plus } from "lucide-react";
import { ParentVocabularyList } from "@/components/parent/ParentVocabularyList";
import { getParentWords } from "@/lib/db/repository";
import { listAvailableVocabularyForLearner, listLearners, resolveSelectedLearnerId } from "@/lib/db/learners";
import { assignVocabularyWordAction, unassignVocabularyWordAction } from "@/app/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; learnerId?: string }>;

function matchesVocabularyQuery(
  word: {
    word: string;
    definition?: string | null;
    example?: string | null;
  },
  normalizedQuery: string,
) {
  if (!normalizedQuery) return true;

  return (
    word.word.toLocaleLowerCase("en-GB").includes(normalizedQuery) ||
    (word.definition ?? "").toLocaleLowerCase("en-GB").includes(normalizedQuery) ||
    (word.example ?? "").toLocaleLowerCase("en-GB").includes(normalizedQuery)
  );
}

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
  const normalizedQuery = initialQuery.trim().toLocaleLowerCase("en-GB");
  const visibleLibraryWords = libraryWords.filter((word) => matchesVocabularyQuery(word, normalizedQuery));

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

      <ParentVocabularyList words={words} initialSearchQuery={initialQuery} learnerId={learnerId} />

      <section className="page-title" style={{ marginTop: 32 }}>
        <h2>Shared vocabulary library</h2>
        <p>Add existing seed or parent-created words to {selectedLearner?.displayName ?? "this child"} without duplicating the library entry.</p>
      </section>
      <section className="word-grid">
        {visibleLibraryWords.length > 0 ? (
          visibleLibraryWords.map((word) => (
            <article className="word-row" key={`library-${word.id}`}>
              <div className="word-main">
                <strong>{word.word}</strong>
                <span>{word.definition ?? "Needs canonical definition and example before practice."}</span>
              </div>
              {word.assigned ? (
                <form action={unassignVocabularyWordAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="wordId" value={word.id} />
                  <button className="button-secondary library-word-button" type="submit">Pause for child</button>
                </form>
              ) : (
                <form action={assignVocabularyWordAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="wordId" value={word.id} />
                  <button className="button library-word-button" type="submit">Add to child</button>
                </form>
              )}
            </article>
          ))
        ) : (
          <p className="empty-state" style={{ gridColumn: "1 / -1" }}>
            {initialQuery.trim()
              ? `No shared vocabulary words match "${initialQuery.trim()}".`
              : "No shared vocabulary words are available yet."}
          </p>
        )}
      </section>
    </main>
  );
}
