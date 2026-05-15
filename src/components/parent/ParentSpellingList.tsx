"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  clearSpellingItemPriorityAction,
  requestSpellingItemNextRoundAction,
  unassignSpellingItemAction
} from "@/app/actions";
import type { ParentSpellingListItem } from "@/lib/db/spellingRepository";

export function ParentSpellingList({
  items,
  initialSearchQuery,
  learnerId,
}: {
  items: ParentSpellingListItem[];
  initialSearchQuery: string;
  learnerId?: string;
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.get("q") ?? "";

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    const normalized = searchQuery.trim();

    const timer = window.setTimeout(() => {
      if (normalized === currentQuery) return;
      const params = new URLSearchParams();
      if (normalized) params.set("q", normalized);
      if (learnerId) params.set("learnerId", learnerId);
      const next = params.toString();
      const nextHref = next ? `${pathname}?${next}` : pathname;
      router.replace(nextHref);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [pathname, router, searchQuery, currentQuery, learnerId]);

  const filteredItems = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("en-GB");
    if (!normalized) return items;

    return items.filter((item) => {
      const target = item.target.toLocaleLowerCase("en-GB");
      const usage = item.usageLabel.toLocaleLowerCase("en-GB");
      const note = item.teachingNote.toLocaleLowerCase("en-GB");

      return (
        target.includes(normalized) ||
        usage.includes(normalized) ||
        note.includes(normalized)
      );
    });
  }, [items, searchQuery]);

  return (
    <>
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
                {item.promptCount > 0 ? (
                  <span className="empty-state spelling-word-status">Ready</span>
                ) : (
                  <span className="empty-state spelling-word-status">Incomplete</span>
                )}
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
                    <button className="button-secondary spelling-word-pause" type="submit">Pause</button>
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
            {searchQuery.trim()
              ? `No assigned spelling words match "${searchQuery.trim()}".`
              : "No spelling words are assigned to this child yet."}
          </p>
        )}
      </section>
    </>
  );
}
