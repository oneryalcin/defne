import { Footprints } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { startMissionAction } from "@/app/actions";
import { getMissionPreview } from "@/lib/db/repository";
import { getLearnerAccessByCode } from "@/lib/db/learners";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";
import { GuideRail } from "@/components/GuideRail";
import { WordPills } from "@/components/WordPills";
import type { MasteryColour } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ChildVocabularyPage() {
  const cookieStore = await cookies();
  const session = parsePilotSession(cookieStore.get(PILOT_SESSION_COOKIE)?.value);
  const learnerId = session?.learnerId ?? (session?.role === "child" ? getLearnerAccessByCode(session.accessCode)?.learnerId : undefined);
  const preview = learnerId
    ? (() => {
        try {
          return getMissionPreview(12, learnerId);
        } catch {
          return { targetQuestionCount: 0, words: [] };
        }
      })()
    : { targetQuestionCount: 0, words: [] };
  const words = preview.words;

  const pills = words.map((word) => ({
    word: word.word,
    level: (word.masteryColour ?? null) as MasteryColour | null,
  }));

  return (
    <main className="spread">
      <article className="book-page" aria-labelledby="map-title">
        <section className="cover-map cover-map--simple">
          <GuideRail message="Hello, hello. Twelve little words today — let's see which ones want to stick." />

          <div className="cover-map__words">
            <WordPills
              pills={pills}
              total={words.length}
              heading="This round's words"
              headingId="map-title"
            />

            <form action={startMissionAction} className="cover-actions">
              <button className="ribbon" type="submit" disabled={words.length === 0}>
                <Footprints size={18} />
                {words.length === 0 ? "No words yet" : "Start"}
              </button>
              <Link className="ribbon ribbon--ghost" href="/child/words">
                Words so far
              </Link>
            </form>
          </div>
        </section>
      </article>
    </main>
  );
}
