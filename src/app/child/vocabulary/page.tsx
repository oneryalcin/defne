import { Footprints } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { startMissionAction } from "@/app/actions";
import { getMissionPreview, getVocabularyFocusOptions } from "@/lib/db/repository";
import { getLearnerAccessByCode } from "@/lib/db/learners";
import { MASTERY_LABELS } from "@/components/ProgressDistribution";
import { parseVocabularyFocus, type VocabularyFocus } from "@/lib/learning/vocabularyFocus";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";
import { GuideRail } from "@/components/GuideRail";
import { WordPills } from "@/components/WordPills";
import type { MasteryColour } from "@/lib/types";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ focus?: string }>;

export default async function ChildVocabularyPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedFocus = parseVocabularyFocus(params.focus);
  const cookieStore = await cookies();
  const session = parsePilotSession(cookieStore.get(PILOT_SESSION_COOKIE)?.value);
  const learnerId = session?.learnerId ?? (session?.role === "child" ? getLearnerAccessByCode(session.accessCode)?.learnerId : undefined);
  const preview = learnerId
    ? (() => {
        try {
          return getMissionPreview(12, learnerId, requestedFocus);
        } catch {
          return { targetQuestionCount: 0, source: "new_round" as const, focus: requestedFocus, words: [] };
        }
      })()
    : { targetQuestionCount: 0, source: "new_round" as const, focus: requestedFocus, words: [] };
  const words = preview.words;
  const focusOptions = learnerId ? getVocabularyFocusOptions(learnerId) : [];
  const activeFocus = preview.focus;

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
            <VocabularyPlanExplanation
              focus={activeFocus}
              hasCurrentRound={preview.source === "current_round"}
              total={preview.targetQuestionCount}
            />

            <section className="practice-focus" aria-labelledby="vocabulary-focus-title">
              <header className="practice-focus__head">
                <span className="cover-chapter">Choose your focus</span>
                <h2 id="vocabulary-focus-title">Practise a colour, just for this round.</h2>
                <p>
                  Colours show how words have gone so far. Choose one for extra practice there, or let Defne choose
                  what is most useful today.
                </p>
              </header>
              {preview.source === "current_round" ? (
                <p className="practice-focus__waiting">Finish your current round before choosing another focus.</p>
              ) : (
                <div className="practice-focus__choices">
                  <Link
                    className={activeFocus === null ? "practice-focus__choice is-active" : "practice-focus__choice"}
                    href="/child/vocabulary"
                    aria-current={activeFocus === null ? "page" : undefined}
                  >
                    <span className="practice-focus__choice-label">Let Defne choose</span>
                    <small>Guided plan</small>
                  </Link>
                  {focusOptions.map((option) => (
                    <VocabularyFocusChoice
                      key={option.colour}
                      focus={option.colour}
                      eligibleCount={option.eligibleCount}
                      active={activeFocus === option.colour}
                    />
                  ))}
                </div>
              )}
            </section>

            <WordPills
              pills={pills}
              total={words.length}
              heading="This round's words"
              headingId="map-title"
            />

            <form action={startMissionAction} className="cover-actions">
              {activeFocus ? <input type="hidden" name="focus" value={activeFocus} /> : null}
              <button className="ribbon" type="submit" disabled={words.length === 0}>
                <Footprints size={18} />
                {words.length === 0 ? "No words ready" : "Start"}
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

function VocabularyPlanExplanation({
  focus,
  hasCurrentRound,
  total,
}: {
  focus: VocabularyFocus | null;
  hasCurrentRound: boolean;
  total: number;
}) {
  if (hasCurrentRound) {
    return (
      <section className="practice-plan-note" aria-labelledby="vocabulary-plan-title">
        <span className="cover-chapter">Your current round</span>
        <h2 id="vocabulary-plan-title">Your words are waiting for you.</h2>
        <p>Finish this round first. Then you can let Defne choose again or pick a colour to practise.</p>
      </section>
    );
  }

  if (focus) {
    return (
      <section className={`practice-plan-note is-focus is-vocabulary-focus-${focus}`} aria-labelledby="vocabulary-plan-title">
        <span className="cover-chapter">Your choice</span>
        <h2 id="vocabulary-plan-title">
          {total > 0 ? vocabularyFocusHeadline(focus) : `No ${MASTERY_LABELS[focus].toLowerCase()} words are ready yet.`}
        </h2>
        <p>This round uses only words with this colour. Defne will not quietly add another colour to fill the round.</p>
      </section>
    );
  }

  return (
    <section className="practice-plan-note" aria-labelledby="vocabulary-plan-title">
      <span className="cover-chapter">Defne&apos;s plan</span>
      <h2 id="vocabulary-plan-title">Practice what is ready to help today.</h2>
      <p>
        Defne uses recent mistakes, review timing, and new words. The dots show your past progress, not which word
        matters most today.
      </p>
    </section>
  );
}

function vocabularyFocusHeadline(focus: VocabularyFocus): string {
  switch (focus) {
    case "red":
      return "Practise words that need more help.";
    case "orange":
      return "Keep building these words.";
    case "yellow":
      return "Help these words become steadier.";
    case "light_green":
      return "Strengthen reliable words.";
    case "green":
      return "Revisit mastered words.";
  }
}

function VocabularyFocusChoice({
  focus,
  eligibleCount,
  active,
}: {
  focus: VocabularyFocus;
  eligibleCount: number;
  active: boolean;
}) {
  return (
    <Link
      className={active ? "practice-focus__choice is-active" : "practice-focus__choice"}
      href={`/child/vocabulary?focus=${focus}`}
      aria-current={active ? "page" : undefined}
      aria-label={`${MASTERY_LABELS[focus]}: ${eligibleCount} words in this colour`}
    >
      <span className={`word-pill__dot l-${focus}`} aria-hidden="true" />
      <span className="practice-focus__choice-label">{MASTERY_LABELS[focus]}</span>
      <small>{eligibleCount} words</small>
    </Link>
  );
}
