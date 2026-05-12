import Link from "next/link";
import { Plus } from "lucide-react";
import { ParentVocabularyList } from "@/components/parent/ParentVocabularyList";
import { getParentWords } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string }> | { q?: string };

export default async function WordsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const words = getParentWords();
  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as { q?: string };
  const initialQuery = resolvedSearchParams.q ?? "";

  return (
    <main className="page">
      <section className="page-title">
        <h1>Vocabulary list</h1>
        <p>Seed words and parent-added words. Incomplete words stay out of child missions until definition and example exist.</p>
      </section>

      <div className="action-row">
        <Link className="button" href="/parent/words/new">
          <Plus size={18} />
          Add vocabulary
        </Link>
      </div>

      <ParentVocabularyList words={words} initialSearchQuery={initialQuery} />
    </main>
  );
}
