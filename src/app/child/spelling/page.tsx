import { Keyboard } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { startSpellingMissionAction } from "@/app/actions";
import { GuideRail } from "@/components/GuideRail";
import { WordPills } from "@/components/WordPills";
import { spellingProgressColour } from "@/components/ProgressDistribution";
import { getLearnerAccessByCode } from "@/lib/db/learners";
import { getSpellingPreview } from "@/lib/db/spellingRepository";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";

export const dynamic = "force-dynamic";

export default async function ChildSpellingPage() {
  const cookieStore = await cookies();
  const session = parsePilotSession(cookieStore.get(PILOT_SESSION_COOKIE)?.value);
  const learnerId = session?.learnerId ?? (session?.role === "child" ? getLearnerAccessByCode(session.accessCode)?.learnerId : undefined);
  const preview = learnerId
    ? (() => {
        try {
          return getSpellingPreview(8, learnerId);
        } catch {
          return { targetItemCount: 0, items: [] };
        }
      })()
    : { targetItemCount: 0, items: [] };
  const pills = preview.items.map((item) => ({
    word: item.target,
    level: spellingProgressColour(item),
  }));

  return (
    <main className="spread">
      <article className="book-page" aria-labelledby="spelling-title">
        <section className="cover-map cover-map--simple">
          <GuideRail message="Read each sentence. Find the mistake, or say it is all correct." />

          <div className="cover-map__words">
            <WordPills
              pills={pills}
              total={preview.targetItemCount}
              heading="This round's spellings"
              headingId="spelling-title"
            />

            <form action={startSpellingMissionAction} className="cover-actions">
              <button className="ribbon" type="submit" disabled={preview.items.length === 0}>
                <Keyboard size={18} />
                {preview.items.length === 0 ? "No spellings yet" : "Start spelling"}
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
