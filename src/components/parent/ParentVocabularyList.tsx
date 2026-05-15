"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  clearVocabularyWordPriorityAction,
  requestVocabularyWordNextRoundAction,
  unassignVocabularyWordAction
} from "@/app/actions";
import { MasteryBadge } from "@/components/MasteryBadge";
import type { ParentWordListItem } from "@/lib/db/repository";

const MASTERY_LABELS: Record<NonNullable<ParentWordListItem["masteryColour"]>, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered",
};

export function ParentVocabularyList({
  words,
  initialSearchQuery,
  learnerId,
}: {
  words: ParentWordListItem[];
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

  const filteredWords = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("en-GB");
    if (!normalized) return words;

    return words.filter((word) => {
      const target = word.word.toLocaleLowerCase("en-GB");
      const definition = (word.definition ?? "").toLocaleLowerCase("en-GB");
      const example = (word.example ?? "").toLocaleLowerCase("en-GB");
      const mastery = word.masteryColour ? MASTERY_LABELS[word.masteryColour].toLocaleLowerCase("en-GB") : "incomplete";

      return (
        target.includes(normalized) ||
        definition.includes(normalized) ||
        example.includes(normalized) ||
        mastery.includes(normalized)
      );
    });
  }, [words, searchQuery]);

  return (
    <>
      <label className="vocabulary-search-field">
        Search vocabulary
        <input
          className="field"
          type="search"
          placeholder="Search by word, definition, example, or status..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search vocabulary"
        />
      </label>

      <section className="word-grid">
        {filteredWords.length > 0 ? (
          filteredWords.map((word) => (
            <article className="word-row" key={word.id}>
              <div className="word-main">
                <strong>{word.word}</strong>
                <span>{word.definition ?? "Needs canonical definition and example before practice."}</span>
              </div>
              <div className="vocabulary-word-actions">
                {word.masteryColour ? (
                  <span className="vocabulary-word-status">
                    <MasteryBadge colour={word.masteryColour} />
                  </span>
                ) : (
                  <span className="empty-state vocabulary-word-status">Incomplete</span>
                )}
                {learnerId ? (
                  word.priorityMode === "next_round_once" ? (
                    <form action={clearVocabularyWordPriorityAction}>
                      <input type="hidden" name="learnerId" value={learnerId} />
                      <input type="hidden" name="wordId" value={word.id} />
                      <button className="button-secondary vocabulary-word-priority" type="submit">Undo</button>
                    </form>
                  ) : (
                    <form action={requestVocabularyWordNextRoundAction}>
                      <input type="hidden" name="learnerId" value={learnerId} />
                      <input type="hidden" name="wordId" value={word.id} />
                      <button className="button-secondary vocabulary-word-priority" type="submit">Next round</button>
                    </form>
                  )
                ) : null}
                {learnerId ? (
                  <form action={unassignVocabularyWordAction}>
                    <input type="hidden" name="learnerId" value={learnerId} />
                    <input type="hidden" name="wordId" value={word.id} />
                    <button className="button-secondary vocabulary-word-pause" type="submit">Pause</button>
                  </form>
                ) : null}
                <Link
                  className="button-secondary vocabulary-word-edit"
                  href={`/parent/words/${word.id}/edit${learnerId ? `?learnerId=${encodeURIComponent(learnerId)}` : ""}`}
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
              ? `No assigned vocabulary words match "${searchQuery.trim()}".`
              : "No vocabulary words are assigned to this child yet."}
          </p>
        )}
      </section>
    </>
  );
}
