import { Footprints } from "lucide-react";
import { startMissionAction } from "@/app/actions";
import { getMissionPreview } from "@/lib/db/repository";
import { GuideRail } from "@/components/GuideRail";
import { MasteryRail } from "@/components/MasteryRail";
import { PencilMap } from "@/components/PencilMap";
import { WordPills } from "@/components/WordPills";
import type { MasteryColour } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAP_LAYOUT = [
  { x: 110, y: 296 },
  { x: 230, y: 274 },
  { x: 350, y: 252 },
  { x: 470, y: 230 },
  { x: 590, y: 196 },
  { x: 700, y: 130 },
];

export default function ChildPage() {
  const preview = getMissionPreview(8);
  const words = preview.words;

  const pills = words.map((word, idx) => ({
    word: word.word,
    level: (word.masteryColour ?? null) as MasteryColour | null,
    isCurrent: idx === 0,
  }));

  const stops = words.slice(0, 6).map((word, idx) => ({
    word: word.word,
    state:
      word.masteryColour === "green" || word.masteryColour === "light_green"
        ? ("done" as const)
        : idx === 0
        ? ("current" as const)
        : ("locked" as const),
    x: MAP_LAYOUT[idx]?.x ?? 100 + idx * 110,
    y: MAP_LAYOUT[idx]?.y ?? 280,
  }));

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <main className="spread">
      <article className="book-page" aria-labelledby="map-title">
        <span className="folio">Today&apos;s path</span>
        <section className="cover-map">
          <div className="cover-map__words">
            <span className="cover-chapter">Today&apos;s path</span>
            <h1 id="map-title" className="cover-title">
              {words.length} stops along <span className="accent">the way</span>.
            </h1>
            <p className="cover-lede">
              Some words are tucked into the hills, others are just past the
              bend. Walk at your own pace — the path waits for you.
            </p>

            <MasteryRail />

            <WordPills
              pills={pills}
              total={words.length}
              heading="Today's words"
            />

            <form action={startMissionAction} className="cover-actions">
              <button className="ribbon" type="submit">
                <Footprints size={18} />
                Start walking
              </button>
              <button
                className="ribbon ribbon--ghost"
                type="button"
                aria-disabled="true"
                disabled
                title="Picker not wired up yet — pilot uses a single round"
              >
                Pick a different round
              </button>
            </form>
          </div>

          <div className="cover-map__landscape-wrap">
            <GuideRail
              message="Hello, hello. Eight little words today — let's see which ones want to stick."
              date={today.toUpperCase()}
              duration="10 MIN"
            />
            <div className="cover-landscape" aria-hidden="false">
              <PencilMap stops={stops} caption="Your vocabulary journey" />
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
