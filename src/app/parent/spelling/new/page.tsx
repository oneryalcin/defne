import { AddSpellingItemForm } from "@/components/parent/AddSpellingItemForm";
import { resolveSelectedLearnerId } from "@/lib/db/learners";

type SearchParams = Promise<{ learnerId?: string }>;

export default async function NewSpellingItemPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const learnerId = resolveSelectedLearnerId(params.learnerId);

  return (
    <main className="page">
      <section className="page-title">
        <h1>Add a spelling word</h1>
        <p>Save clean sentences. The child practice will create zero-or-one mistake versions from this reviewed content.</p>
      </section>

      <AddSpellingItemForm learnerId={learnerId} />
    </main>
  );
}
