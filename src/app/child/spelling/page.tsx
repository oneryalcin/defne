import { Keyboard } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { replaceSpellingMissionAction, startSpellingMissionAction } from "@/app/actions";
import { GuideRail } from "@/components/GuideRail";
import { WordPills } from "@/components/WordPills";
import {
  SPELLING_LABELS,
  spellingProgressColour,
} from "@/components/ProgressDistribution";
import { getLearnerAccessByCode } from "@/lib/db/learners";
import { getSpellingFocusOptions, getSpellingPreview } from "@/lib/db/spellingRepository";
import { parseSpellingFocus, spellingFocusColours, type SpellingFocus } from "@/lib/learning/spellingProgress";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ focus?: string; replace?: string }>;

export default async function ChildSpellingPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedFocus = parseSpellingFocus(params.focus);
  const replacingRound = params.replace === "1";
  const cookieStore = await cookies();
  const session = parsePilotSession(cookieStore.get(PILOT_SESSION_COOKIE)?.value);
  const learnerId = session?.learnerId ?? (session?.role === "child" ? getLearnerAccessByCode(session.accessCode)?.learnerId : undefined);
  const preview = learnerId
    ? (() => {
        try {
          return getSpellingPreview(8, learnerId, requestedFocus);
        } catch {
          return { targetItemCount: 0, source: "new_round" as const, focus: requestedFocus, items: [] };
        }
      })()
    : { targetItemCount: 0, source: "new_round" as const, focus: requestedFocus, items: [] };
  const focusOptions = learnerId ? getSpellingFocusOptions(learnerId) : [];
  const activeFocus = preview.focus;
  const canReplaceRound = preview.source === "current_round" && replacingRound;
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
            <SpellingPlanExplanation
              focus={activeFocus}
              hasCurrentRound={preview.source === "current_round"}
              total={preview.targetItemCount}
            />

            <section className="practice-focus" aria-labelledby="spelling-focus-title">
              <header className="practice-focus__head">
                <span className="cover-chapter">Choose your focus</span>
                <h2 id="spelling-focus-title">Practise a colour, just for this round.</h2>
                <p>
                  Colours show how spelling has gone so far. Choose one when you want extra practice there,
                  or let Defne choose what is most useful today.
                </p>
              </header>
              {preview.source === "current_round" && !canReplaceRound ? (
                <p className="practice-focus__waiting">Available after this round. Finish your spellings, then choose one.</p>
              ) : null}
              {canReplaceRound ? (
                <ReplaceSpellingRoundChoices focusOptions={focusOptions} />
              ) : (
                <div className="practice-focus__choices" aria-disabled={preview.source === "current_round" || undefined}>
                  {preview.source === "current_round" ? (
                  <button className="practice-focus__choice" type="button" disabled>
                    <span className="practice-focus__choice-label">Let Defne choose</span>
                    <small>Guided plan</small>
                  </button>
                  ) : (
                  <Link
                    className={activeFocus === null ? "practice-focus__choice is-active" : "practice-focus__choice"}
                    href="/child/spelling"
                    aria-current={activeFocus === null ? "page" : undefined}
                  >
                    <span className="practice-focus__choice-label">Let Defne choose</span>
                    <small>Guided plan</small>
                  </Link>
                  )}
                  {focusOptions.map((option) => (
                  <FocusChoice
                    key={option.status}
                    focus={option.status}
                    eligibleCount={option.eligibleCount}
                    active={activeFocus === option.status}
                    disabled={preview.source === "current_round"}
                  />
                  ))}
                </div>
              )}
              {preview.source === "current_round" && !canReplaceRound ? (
                <Link className="practice-focus__replace-link" href="/child/spelling?replace=1">
                  Choose a different round instead
                </Link>
              ) : null}
            </section>

            <WordPills
              pills={pills}
              total={preview.targetItemCount}
              heading="This round's spellings"
              headingId="spelling-title"
            />

            <form action={startSpellingMissionAction} className="cover-actions">
              {activeFocus ? <input type="hidden" name="focus" value={activeFocus} /> : null}
              <button className="ribbon" type="submit" disabled={preview.items.length === 0}>
                <Keyboard size={18} />
                {preview.items.length === 0 ? "No spellings ready" : preview.source === "current_round" ? "Continue round" : "Start spelling"}
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

function ReplaceSpellingRoundChoices({
  focusOptions,
}: {
  focusOptions: Array<{ status: SpellingFocus; eligibleCount: number }>;
}) {
  return (
    <div className="practice-focus__replacement">
      <p>
        Starting another round ends this one. Any answers you have already given still count in your learning history.
      </p>
      <div className="practice-focus__choices">
        <form action={replaceSpellingMissionAction}>
          <button className="practice-focus__choice" type="submit">
            <span className="practice-focus__choice-label">Let Defne choose</span>
            <small>Start new round</small>
          </button>
        </form>
        {focusOptions.map((option) => (
          <form key={option.status} action={replaceSpellingMissionAction}>
            <input type="hidden" name="focus" value={option.status} />
            <button className="practice-focus__choice" type="submit">
              <span className={`word-pill__dot l-${spellingFocusColours[option.status]}`} aria-hidden="true" />
              <span className="practice-focus__choice-label">{SPELLING_LABELS[option.status]}</span>
              <small>{option.eligibleCount} ready</small>
            </button>
          </form>
        ))}
      </div>
      <Link className="practice-focus__keep-link" href="/child/spelling">
        Keep this round
      </Link>
    </div>
  );
}

function SpellingPlanExplanation({
  focus,
  hasCurrentRound,
  total,
}: {
  focus: SpellingFocus | null;
  hasCurrentRound: boolean;
  total: number;
}) {
  if (hasCurrentRound) {
    return (
      <section className="practice-plan-note" aria-labelledby="spelling-plan-title">
        <span className="cover-chapter">Your current round</span>
        <h2 id="spelling-plan-title">Your spellings are waiting for you.</h2>
        <p>Finish this round first. Then you can let Defne choose again or pick a colour to practise.</p>
      </section>
    );
  }

  if (focus) {
    return (
      <section className={`practice-plan-note is-focus is-focus-${focus}`} aria-labelledby="spelling-plan-title">
        <span className="cover-chapter">Your choice</span>
        <h2 id="spelling-plan-title">
          {total > 0 ? focusHeadline(focus) : `No ${SPELLING_LABELS[focus].toLowerCase()} spellings are ready yet.`}
        </h2>
        <p>
          This round uses only spellings with this colour. Defne will not quietly add another colour to fill the round.
        </p>
      </section>
    );
  }

  return (
    <section className="practice-plan-note" aria-labelledby="spelling-plan-title">
      <span className="cover-chapter">Defne&apos;s plan</span>
      <h2 id="spelling-plan-title">Practice what is ready to help today.</h2>
      <p>
        Defne uses recent mistakes and enough rest between tries. The dots show your past practice, not which word matters most today.
      </p>
    </section>
  );
}

function focusHeadline(focus: SpellingFocus): string {
  switch (focus) {
    case "needs_work":
      return "Practise spellings that need another look.";
    case "practising":
      return "Keep practising these spellings.";
    case "spotted_once":
      return "Build on spellings you spotted once.";
    case "reliable":
      return "Strengthen reliable spellings.";
    case "steady":
      return "Revisit steady spellings.";
  }
}

function FocusChoice({
  focus,
  eligibleCount,
  active,
  disabled,
}: {
  focus: SpellingFocus;
  eligibleCount: number;
  active: boolean;
  disabled: boolean;
}) {
  const colour = spellingFocusColours[focus];
  const label = SPELLING_LABELS[focus];

  if (disabled) {
    return (
      <button className="practice-focus__choice" type="button" disabled aria-label={`${label}: ${eligibleCount} spellings, available after this round`}>
        <span className={`word-pill__dot l-${colour}`} aria-hidden="true" />
        <span className="practice-focus__choice-label">{label}</span>
        <small>{eligibleCount} ready</small>
      </button>
    );
  }

  return (
    <Link
      className={active ? "practice-focus__choice is-active" : "practice-focus__choice"}
      href={`/child/spelling?focus=${focus}`}
      aria-current={active ? "page" : undefined}
      aria-label={`${label}: ${eligibleCount} spellings ready`}
    >
      <span className={`word-pill__dot l-${colour}`} aria-hidden="true" />
      <span className="practice-focus__choice-label">{label}</span>
      <small>{eligibleCount} ready</small>
    </Link>
  );
}
