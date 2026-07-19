import Link from "next/link";
import { Plus } from "lucide-react";
import { setSpellingRoundMixAction } from "@/app/actions";
import { SPELLING_ORDER, type SpellingProgressStatus } from "@/components/ProgressDistribution";
import { SpellingHeatmap } from "@/components/SpellingHeatmap";
import {
  ParentSpellingList,
  type SpellingStatusFilter,
} from "@/components/parent/ParentSpellingList";
import {
  getSpellingRoundMixPreference,
  getParentSpellingItems,
  listAvailableSpellingItemsForLearner
} from "@/lib/db/spellingRepository";
import { listLearners, resolveSelectedLearnerId } from "@/lib/db/learners";

const HEATMAP_PAGE_SIZE = 140;

type SearchParams = Promise<{ q?: string; status?: string; p?: string; learnerId?: string }>;

export const dynamic = "force-dynamic";

export default async function ParentSpellingPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const learnerId = resolveSelectedLearnerId(resolvedSearchParams.learnerId);
  const learners = listLearners();
  const selectedLearner = learners.find((learner) => learner.id === learnerId);
  const items = getParentSpellingItems(learnerId);
  const libraryItems = listAvailableSpellingItemsForLearner(learnerId);
  const spellingMix = getSpellingRoundMixPreference(learnerId);
  const initialQuery = resolvedSearchParams.q ?? "";
  const initialStatusFilter: SpellingStatusFilter = isSpellingProgressStatus(resolvedSearchParams.status)
    ? resolvedSearchParams.status
    : "all";
  const heatmapPage = Math.max(1, parseInt(resolvedSearchParams.p ?? "1", 10) || 1);
  const learnerName = selectedLearner?.displayName ?? "this child";

  return (
    <main className="page">
      <section className="page-title">
        <h1>Spelling words</h1>
        <p>Assigned spelling items for {selectedLearner?.displayName ?? "the selected child"}. Shared spelling items can be added per child.</p>
      </section>

      <div className="action-row">
        {learners.map((learner) => (
          <Link
            key={learner.id}
            className={learner.id === learnerId ? "button" : "button-secondary"}
            href={`/parent/spelling?learnerId=${encodeURIComponent(learner.id)}`}
          >
            {learner.displayName}
          </Link>
        ))}
        <Link className="button" href={`/parent/spelling/new?learnerId=${encodeURIComponent(learnerId)}`}>
          <Plus size={18} />
          Add spelling word
        </Link>
      </div>

      <section className="dash-section" aria-labelledby="spelling-mix">
        <header className="section-head">
          <span className="section-head__label">Next spelling round</span>
          <h2 id="spelling-mix" className="section-head__title">Choose the spelling mix.</h2>
          <p className="section-head__sub">Targets are per child. If a bucket is short, Defne fills with the next useful spelling item.</p>
        </header>
        <form action={setSpellingRoundMixAction} className="queue-mix-form">
          <input type="hidden" name="learnerId" value={learnerId} />
          <label>
            <span>Not started</span>
            <input type="number" name="spellingRoundNew" min="0" max="8" defaultValue={spellingMix.new} />
          </label>
          <label>
            <span>Mistake recovery</span>
            <input type="number" name="spellingRoundRecovery" min="0" max="8" defaultValue={spellingMix.recovery} />
          </label>
          <label>
            <span>Review</span>
            <input type="number" name="spellingRoundReview" min="0" max="8" defaultValue={spellingMix.review} />
          </label>
          <label>
            <span>Reliable</span>
            <input type="number" name="spellingRoundStable" min="0" max="8" defaultValue={spellingMix.stable} />
          </label>
          <button className="button-secondary" type="submit">Save spelling mix</button>
        </form>
      </section>

      <section className="dash-section" aria-labelledby="spelling-heatmap">
        <header className="section-head">
          <span className="section-head__label">Spelling heatmap</span>
          <h2 id="spelling-heatmap" className="section-head__title">Every spelling, at a glance.</h2>
          <p className="section-head__sub">
            {items.length} assigned spellings. Each square shows current spelling progress; hover for attempt history or open the item to edit it.
          </p>
        </header>
        <div className="bento col-12">
          <SpellingHeatmap
            words={items}
            page={heatmapPage}
            pageSize={HEATMAP_PAGE_SIZE}
            basePath={`/parent/spelling?learnerId=${encodeURIComponent(learnerId)}`}
            variant="parent"
            detailQuery={`?learnerId=${encodeURIComponent(learnerId)}`}
          />
        </div>
      </section>

      <ParentSpellingList
        items={items}
        libraryItems={libraryItems}
        initialSearchQuery={initialQuery}
        initialStatusFilter={initialStatusFilter}
        learnerId={learnerId}
        learnerName={learnerName}
      />
    </main>
  );
}

function isSpellingProgressStatus(value: string | undefined): value is SpellingProgressStatus {
  return SPELLING_ORDER.some((status) => status === value);
}
