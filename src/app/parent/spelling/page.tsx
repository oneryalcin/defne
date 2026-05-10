import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { getParentSpellingItems } from "@/lib/db/spellingRepository";

export const dynamic = "force-dynamic";

export default function ParentSpellingPage() {
  const items = getParentSpellingItems();

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

      <section className="word-grid">
        {items.map((item) => (
          <article className="word-row" key={item.id}>
            <div className="word-main">
              <strong>{item.target}</strong>
              <span>{item.teachingNote || "Pair shell only. Add teaching note and clean sentences before practice."}</span>
              <small>
                {item.usageLabel || "no label"} · {item.promptCount} sentence{item.promptCount === 1 ? "" : "s"} · {item.wrongCount} misses
              </small>
            </div>
            <div className="action-row">
              {item.promptCount > 0 ? <span className="empty-state">Ready</span> : <span className="empty-state">Incomplete</span>}
              <Link className="button-secondary" href={`/parent/spelling/${item.id}`}>
                <Pencil size={16} />
                Edit
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
