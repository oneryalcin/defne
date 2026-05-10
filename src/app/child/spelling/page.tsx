import { Keyboard } from "lucide-react";
import Link from "next/link";
import { startSpellingMissionAction } from "@/app/actions";
import { GuideRail } from "@/components/GuideRail";

export const dynamic = "force-dynamic";

export default function ChildSpellingPage() {
  return (
    <main className="spread">
      <article className="book-page" aria-labelledby="spelling-title">
        <section className="cover-map cover-map--simple">
          <GuideRail message="Read each sentence. Find the mistake, or say it is all correct." />

          <div className="cover-map__words">
            <div className="spelling-preview">
              <span className="cover-chapter">Spelling</span>
              <h1 id="spelling-title" className="cover-title">
                Spelling detective.
              </h1>
            </div>

            <form action={startSpellingMissionAction} className="cover-actions">
              <button className="ribbon" type="submit">
                <Keyboard size={18} />
                Start spelling
              </button>
              <Link className="ribbon ribbon--ghost" href="/child/spelling/words">
                Spelling words
              </Link>
              <Link className="ribbon ribbon--ghost" href="/child">
                Back
              </Link>
            </form>
          </div>
        </section>
      </article>
    </main>
  );
}
