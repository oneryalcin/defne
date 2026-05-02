import Link from "next/link";
import { saveWordAction } from "@/app/actions";

export default function NewWordPage() {
  return (
    <main className="page">
      <section className="page-title">
        <h1>Add a word</h1>
        <p>Canonical parent content is the source of truth. AI-generated hints later must sit underneath this data.</p>
      </section>

      <form action={saveWordAction} className="mission-panel">
        <div className="form-grid">
          <label>
            Word
            <input className="field" required name="word" placeholder="reluctant" />
          </label>
          <label>
            Difficulty
            <select className="field" name="difficultyLevel" defaultValue="2">
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
          <label className="wide">
            Definition
            <input className="field" required name="definition" placeholder="not willing or not keen to do something" />
          </label>
          <label className="wide">
            Example sentence
            <input className="field" required name="example" placeholder="Aylin was reluctant to enter the dark room." />
          </label>
          <label>
            Synonym
            <input className="field" name="synonym" placeholder="hesitant" />
          </label>
          <label>
            Antonym
            <input className="field" name="antonym" placeholder="eager" />
          </label>
          <label>
            Spelling note
            <input className="field" name="spellingNote" placeholder="Ends with -ant, not -ent." />
          </label>
          <label>
            Confusable
            <input className="field" name="confusable" placeholder="reticent" />
          </label>
        </div>
        <div className="action-row">
          <button className="button" type="submit">
            Save word
          </button>
          <Link className="button-secondary" href="/parent/words">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
