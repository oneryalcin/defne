import Link from "next/link";
import { importWordsAction } from "@/app/actions";
import { resolveSelectedLearnerId } from "@/lib/db/learners";

type SearchParams = Promise<{ learnerId?: string }> | { learnerId?: string };

export default async function ImportWordsPage({ searchParams }: { searchParams?: SearchParams }) {
  const resolved = (await Promise.resolve(searchParams ?? {})) as { learnerId?: string };
  const learnerId = resolveSelectedLearnerId(resolved.learnerId);
  return (
    <main className="page">
      <section className="page-title">
        <h1>Paste vocabulary</h1>
        <p>Paste one word per line, or comma-separated. Imported shells are visible in the parent list until you add definitions.</p>
      </section>

      <form action={importWordsAction} className="mission-panel">
        <input type="hidden" name="learnerId" value={learnerId} />
        <label>
          Vocabulary words
          <textarea
            className="textarea"
            required
            name="words"
            placeholder={"abundant\naccurate\nacquire\nadmire\nagile"}
          />
        </label>
        <div className="action-row">
          <button className="button" type="submit">
            Import vocabulary
          </button>
          <Link className="button-secondary" href={`/parent/words?learnerId=${encodeURIComponent(learnerId)}`}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
