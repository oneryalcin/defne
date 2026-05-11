import Link from "next/link";
import { importWordsAction } from "@/app/actions";

export default function ImportWordsPage() {
  return (
    <main className="page">
      <section className="page-title">
        <h1>Paste vocabulary</h1>
        <p>Paste one word per line, or comma-separated. Imported shells are visible in the parent list until you add definitions.</p>
      </section>

      <form action={importWordsAction} className="mission-panel">
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
          <Link className="button-secondary" href="/parent/words">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
