import { AddWordForm } from "@/components/parent/AddWordForm";
import { resolveSelectedLearnerId } from "@/lib/db/learners";

type SearchParams = Promise<{ learnerId?: string }>;

export default async function NewWordPage({ searchParams }: { searchParams?: SearchParams }) {
  const resolved = searchParams ? await searchParams : {};
  const learnerId = resolveSelectedLearnerId(resolved.learnerId);
  return (
    <main className="page">
      <section className="page-title">
        <h1>Add vocabulary</h1>
        <p>Review the wording before it enters practice.</p>
      </section>

      <AddWordForm
        learnerId={learnerId}
        cancelHref={`/parent/words?learnerId=${encodeURIComponent(learnerId)}`}
        returnTo={`/parent/words?learnerId=${encodeURIComponent(learnerId)}`}
      />
    </main>
  );
}
