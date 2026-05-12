import Link from "next/link";
import { Plus } from "lucide-react";
import { ParentSpellingList } from "@/components/parent/ParentSpellingList";
import { getParentSpellingItems } from "@/lib/db/spellingRepository";

type SearchParams = Promise<{ q?: string }> | { q?: string };

export const dynamic = "force-dynamic";

export default async function ParentSpellingPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const items = getParentSpellingItems();
  const resolvedSearchParams = (await Promise.resolve(searchParams ?? {})) as { q?: string };
  const initialQuery = resolvedSearchParams.q ?? "";

  return (
    <main className="page">
      <section className="page-title">
        <h1>Spelling words</h1>
        <p>Reviewable spelling items for sentence mistake practice. Items need at least one clean sentence before child practice.</p>
      </section>

      <div className="action-row">
        <Link className="button" href="/parent/spelling/new">
          <Plus size={18} />
          Add spelling word
        </Link>
      </div>

      <ParentSpellingList items={items} initialSearchQuery={initialQuery} />
    </main>
  );
}
