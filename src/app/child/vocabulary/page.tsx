import { Footprints } from "lucide-react";
import Link from "next/link";
import { startMissionAction } from "@/app/actions";
import { getMissionPreview } from "@/lib/db/repository";
import { GuideRail } from "@/components/GuideRail";
import { WordPills } from "@/components/WordPills";
import type { MasteryColour } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function ChildVocabularyPage() {
  const preview = getMissionPreview(12);
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
              <button className="ribbon" type="submit">
                <Footprints size={18} />
                Start
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
