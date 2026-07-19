"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  assignSpellingItemAction,
  clearSpellingItemPriorityAction,
  requestSpellingItemNextRoundAction,
  unassignSpellingItemAction
} from "@/app/actions";
import {
  SPELLING_KEY,
  SPELLING_LABELS,
  SPELLING_ORDER,
  spellingProgressStatus,
  type SpellingProgressStatus,
} from "@/components/ProgressDistribution";
import type { ParentSpellingLibraryItem, ParentSpellingListItem } from "@/lib/db/spellingRepository";

export type SpellingStatusFilter = SpellingProgressStatus | "all";

function searchRank(fields: {
  target: string;
  usageLabel?: string | null;
  teachingNote?: string | null;
}, normalizedQuery: string): number | null {
  const target = fields.target.toLocaleLowerCase("en-GB");
  const usage = (fields.usageLabel ?? "").toLocaleLowerCase("en-GB");
  const note = (fields.teachingNote ?? "").toLocaleLowerCase("en-GB");

  if (target === normalizedQuery) return 0;
  if (target.startsWith(normalizedQuery)) return 1;
  if (target.includes(normalizedQuery)) return 2;
  if (usage.includes(normalizedQuery)) return 3;
  if (note.includes(normalizedQuery)) return 4;
  return null;
}

export function ParentSpellingList({
  items,
  libraryItems,
  initialSearchQuery,
  initialStatusFilter,
  learnerId,
  learnerName,
}: {
  items: ParentSpellingListItem[];
  libraryItems: ParentSpellingLibraryItem[];
  initialSearchQuery: string;
  initialStatusFilter: SpellingStatusFilter;
  learnerId?: string;
  learnerName: string;
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [statusFilter, setStatusFilter] = useState<SpellingStatusFilter>(initialStatusFilter);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  useEffect(() => {
    const normalized = searchQuery.trim();

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (normalized) params.set("q", normalized);
      else params.delete("q");
      if (statusFilter !== "all") params.set("status", statusFilter);
      else params.delete("status");
      if (learnerId) params.set("learnerId", learnerId);
      else params.delete("learnerId");
      const next = params.toString();
      const nextHref = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      if (nextHref !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, "", nextHref);
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [searchQuery, statusFilter, learnerId]);

  const filteredItems = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("en-GB");
    return items.flatMap((item) => {
      if (statusFilter !== "all" && spellingProgressStatus(item) !== statusFilter) return [];
      if (!normalized) return [{ item, rank: 0 }];
      const rank = searchRank(item, normalized);
      return rank === null ? [] : [{ item, rank }];
    }).sort((a, b) => a.rank - b.rank || a.item.target.localeCompare(b.item.target)).map((result) => result.item);
  }, [items, searchQuery, statusFilter]);

  const filteredLibraryItems = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("en-GB");
    if (!normalized) return libraryItems;

    return libraryItems.flatMap((item) => {
      const rank = searchRank(item, normalized);
      return rank === null ? [] : [{ item, rank }];
    }).sort((a, b) => a.rank - b.rank || a.item.target.localeCompare(b.item.target)).map((result) => result.item);
  }, [libraryItems, searchQuery]);

  return (
    <>
      <div className="spelling-list-controls">
        <label className="spelling-search-field">
          Search spelling words
          <input
            className="field"
            type="search"
            placeholder="Search by target word, label, or note..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search spelling words"
          />
        </label>
        <label className="spelling-status-filter">
          Filter by progress
          <select
            className="field"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as SpellingStatusFilter)}
          >
            <option value="all">All spellings</option>
            {SPELLING_ORDER.map((status) => (
              <option key={status} value={status}>{SPELLING_LABELS[status]}</option>
            ))}
          </select>
        </label>
      </div>

      <section className="word-grid">
        {filteredItems.length > 0 ? (
          filteredItems.map((item) => (
            <article className="word-row" key={item.id}>
              <div className="word-main">
                <strong>{item.target}</strong>
                <span>{item.teachingNote || "Pair shell only. Add teaching note and clean sentences before practice."}</span>
                <small>
                  {item.usageLabel || "no label"} · {item.promptCount} sentence{item.promptCount === 1 ? "" : "s"} · {item.wrongCount} misses
                </small>
              </div>
              <div className="spelling-word-actions">
                <span
                  className={`mastery-mini spelling-word-status ${SPELLING_KEY[spellingProgressStatus(item)]}`}
                  title={item.promptCount > 0 ? undefined : "No approved sentence is ready for practice yet."}
                >
                  <span className="mastery-mini__dot" aria-hidden="true" />
                  {SPELLING_LABELS[spellingProgressStatus(item)]}
                </span>
                {learnerId ? (
                  item.priorityMode === "next_round_once" ? (
                    <form action={clearSpellingItemPriorityAction}>
                      <input type="hidden" name="learnerId" value={learnerId} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button className="button-secondary spelling-word-priority" type="submit">Undo</button>
                    </form>
                  ) : (
                    <form action={requestSpellingItemNextRoundAction}>
                      <input type="hidden" name="learnerId" value={learnerId} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button className="button-secondary spelling-word-priority" type="submit">Next round</button>
                    </form>
                  )
                ) : null}
                {learnerId ? (
                  <form action={unassignSpellingItemAction}>
                    <input type="hidden" name="learnerId" value={learnerId} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <button className="button-secondary spelling-word-pause" type="submit">Unassign</button>
                  </form>
                ) : null}
                <Link
                  className="button-secondary spelling-word-edit"
                  href={`/parent/spelling/${item.id}${learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ""}`}
                >
                  <Pencil size={16} />
                  Edit
                </Link>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state" style={{ gridColumn: "1 / -1" }}>
            {searchQuery.trim() || statusFilter !== "all"
              ? `No assigned spelling words match the current search and progress filter.`
              : "No spelling words are assigned to this child yet."}
          </p>
        )}
      </section>

      <section className="page-title" style={{ marginTop: 32 }}>
        <h2>Shared spelling library</h2>
        <p>Add existing reviewed spelling items to {learnerName} without duplicating the library entry.</p>
      </section>
      <section className="word-grid">
        {filteredLibraryItems.length > 0 ? (
          filteredLibraryItems.map((item) => (
            <article className="word-row" key={`spelling-library-${item.id}`}>
              <div className="word-main">
                <strong>{item.target}</strong>
                <span>{item.teachingNote || "Pair shell only. Add teaching note and clean sentences before practice."}</span>
                <small>
                  {item.usageLabel || "no label"} · {item.promptCount} sentence{item.promptCount === 1 ? "" : "s"}
                </small>
              </div>
              {item.assigned ? (
                <form action={unassignSpellingItemAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button className="button-secondary library-word-button" type="submit">Unassign from child</button>
                </form>
              ) : (
                <form action={assignSpellingItemAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="itemId" value={item.id} />
                  <button className="button library-word-button" type="submit">Add to child</button>
                </form>
              )}
            </article>
          ))
        ) : (
          <p className="empty-state" style={{ gridColumn: "1 / -1" }}>
            {searchQuery.trim()
              ? `No shared spelling items match "${searchQuery.trim()}".`
              : "No shared spelling items are available yet."}
          </p>
        )}
      </section>
    </>
  );
}
