import { BookOpen, Keyboard } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { GuideRail } from "@/components/GuideRail";
import {
  ProgressDistribution,
  spellingProgressBuckets,
  vocabularyProgressBuckets,
} from "@/components/ProgressDistribution";
import { getLearnerAccessByCode, learnerExists } from "@/lib/db/learners";
import { getParentWords } from "@/lib/db/repository";
import { getChildSpellingWords } from "@/lib/db/spellingRepository";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";

export const dynamic = "force-dynamic";

async function currentChildLearnerId(): Promise<string | null> {
  const jar = await cookies();
  const current = parsePilotSession(jar.get(PILOT_SESSION_COOKIE)?.value);
  if (!current || current.role !== "child") return null;
  if (current.learnerId && learnerExists(current.learnerId)) return current.learnerId;
  return getLearnerAccessByCode(current.accessCode)?.learnerId ?? null;
}

export default async function ChildPage() {
  const learnerId = await currentChildLearnerId();
  const vocabularyWords = getParentWords(learnerId ?? undefined);
  const spellingWords = getChildSpellingWords(learnerId ?? undefined);

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

            <div className="child-progress-grid" aria-label="Your progress snapshots">
              <section className="panel child-progress-panel" aria-labelledby="child-vocabulary-progress">
                <span className="bento__eyebrow">Vocabulary so far</span>
                <h2 id="child-vocabulary-progress">Words</h2>
                <ProgressDistribution
                  buckets={vocabularyProgressBuckets(vocabularyWords)}
                  ariaLabel="Vocabulary progress distribution"
                />
                <Link className="child-progress-panel__link" href="/child/words">
                  Open words so far →
                </Link>
              </section>

              <section className="panel child-progress-panel" aria-labelledby="child-spelling-progress">
                <span className="bento__eyebrow">Spellings so far</span>
                <h2 id="child-spelling-progress">Spellings</h2>
                <ProgressDistribution
                  buckets={spellingProgressBuckets(spellingWords)}
                  ariaLabel="Spelling progress distribution"
                />
                <Link className="child-progress-panel__link" href="/child/spelling/words">
                  Open spellings so far →
                </Link>
              </section>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
