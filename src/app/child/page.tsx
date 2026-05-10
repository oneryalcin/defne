import { BookOpen, Keyboard } from "lucide-react";
import Link from "next/link";
import { GuideRail } from "@/components/GuideRail";

export const dynamic = "force-dynamic";

export default function ChildPage() {
  return (
    <main className="spread">
      <article className="book-page" aria-labelledby="child-mode-title">
        <section className="cover-map cover-map--simple">
          <GuideRail message="Hello, hello. Choose one small practice path for today." />

          <div className="mode-grid child-mode-grid">
            <h1 id="child-mode-title" className="cover-title child-mode-title">
              Choose practice.
            </h1>

            <Link className="mode-panel child-mode-card" href="/child/vocabulary">
              <BookOpen size={22} aria-hidden="true" />
              <span>
                <strong>Vocabulary</strong>
                <small>Meanings, examples, and sentence practice.</small>
              </span>
            </Link>

            <Link className="mode-panel child-mode-card" href="/child/spelling">
              <Keyboard size={22} aria-hidden="true" />
              <span>
                <strong>Spelling</strong>
                <small>Find one spelling mistake, or decide the sentence is correct.</small>
              </span>
            </Link>

            <Link className="ribbon ribbon--ghost" href="/child/words">
              Words so far
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
