import Link from "next/link";
import { Plus } from "lucide-react";
import { getParentWords } from "@/lib/db/repository";
import { MasteryBadge } from "@/components/MasteryBadge";

export const dynamic = "force-dynamic";

export default function WordsPage() {
  const words = getParentWords();

  return (
    <main className="page">
      <section className="page-title">
        <h1>Vocabulary list</h1>
        <p>Seed words and parent-added words. Incomplete words stay out of child missions until definition and example exist.</p>
      </section>

      <div className="action-row">
        <Link className="button" href="/parent/words/new">
          <Plus size={18} />
          Add word
        </Link>
        <Link className="button-secondary" href="/parent/import">
          Paste batch
        </Link>
      </div>

      <section className="word-grid">
        {words.map((word) => (
          <article className="word-row" key={word.id}>
            <div className="word-main">
              <strong>{word.word}</strong>
              <span>{word.definition ?? "Needs canonical definition and example before practice."}</span>
            </div>
            {word.masteryColour ? <MasteryBadge colour={word.masteryColour} /> : <span className="empty-state">Incomplete</span>}
          </article>
        ))}
      </section>
    </main>
  );
}
