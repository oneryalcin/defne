"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import {
  assignVocabularyWordAction,
  clearVocabularyWordPriorityAction,
  requestVocabularyWordNextRoundAction,
  unassignVocabularyWordAction,
} from "@/app/actions";
import { MasteryBadge } from "@/components/MasteryBadge";
import type { ParentWordListItem } from "@/lib/db/repository";
import type { ParentVocabularyLibraryItem } from "@/lib/db/learners";

const MASTERY_LABELS: Record<NonNullable<ParentWordListItem["masteryColour"]>, string> = {
  red: "Needs work",
  orange: "Building",
  yellow: "Nearly steady",
  light_green: "Reliable",
  green: "Mastered",
};

function searchRank(fields: {
  word: string;
  definition?: string | null;
  example?: string | null;
  status?: string | null;
}, normalizedQuery: string): number | null {
  const word = fields.word.toLocaleLowerCase("en-GB");
  const definition = (fields.definition ?? "").toLocaleLowerCase("en-GB");
  const example = (fields.example ?? "").toLocaleLowerCase("en-GB");
  const status = (fields.status ?? "").toLocaleLowerCase("en-GB");

  if (word === normalizedQuery) return 0;
  if (word.startsWith(normalizedQuery)) return 1;
  if (word.includes(normalizedQuery)) return 2;
  if (definition.startsWith(normalizedQuery)) return 3;
  if (definition.includes(normalizedQuery)) return 4;
  if (example.includes(normalizedQuery)) return 5;
  if (status.includes(normalizedQuery)) return 6;
  return null;
}

export function ParentVocabularyList({
  words,
  libraryWords,
  initialSearchQuery,
  learnerId,
  learnerName,
}: {
  words: ParentWordListItem[];
  libraryWords: ParentVocabularyLibraryItem[];
  initialSearchQuery: string;
  learnerId?: string;
  learnerName: string;
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  useEffect(() => {
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    const normalized = searchQuery.trim();

    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (normalized) params.set("q", normalized);
      else params.delete("q");
      const next = params.toString();
      const nextHref = next ? `${window.location.pathname}?${next}` : window.location.pathname;
      if (nextHref !== `${window.location.pathname}${window.location.search}`) {
        window.history.replaceState(null, "", nextHref);
      }
    }, 150);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const filteredWords = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("en-GB");
    if (!normalized) return words;

    return words.flatMap((word) => {
      const mastery = word.masteryColour ? MASTERY_LABELS[word.masteryColour].toLocaleLowerCase("en-GB") : "incomplete";
      const rank = searchRank({
        word: word.word,
        definition: word.definition,
        example: word.example,
        status: mastery
      }, normalized);
      return rank === null ? [] : [{ word, rank }];
    }).sort((a, b) => a.rank - b.rank || a.word.word.localeCompare(b.word.word)).map((result) => result.word);
  }, [words, searchQuery]);

  const filteredLibraryWords = useMemo(() => {
    const normalized = searchQuery.trim().toLocaleLowerCase("en-GB");
    if (!normalized) return libraryWords;

    return libraryWords.flatMap((word) => {
      const rank = searchRank({ word: word.word, definition: word.definition }, normalized);
      return rank === null ? [] : [{ word, rank }];
    }).sort((a, b) => a.rank - b.rank || a.word.word.localeCompare(b.word.word)).map((result) => result.word);
  }, [libraryWords, searchQuery]);

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
                    <button className="button-secondary vocabulary-word-pause" type="submit">Unassign</button>
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

      <section className="page-title" style={{ marginTop: 32 }}>
        <h2>Shared vocabulary library</h2>
        <p>Add existing seed or parent-created words to {learnerName} without duplicating the library entry.</p>
      </section>
      <section className="word-grid">
        {filteredLibraryWords.length > 0 ? (
          filteredLibraryWords.map((word) => (
            <article className="word-row" key={`library-${word.id}`}>
              <div className="word-main">
                <strong>{word.word}</strong>
                <span>{word.definition ?? "Needs canonical definition and example before practice."}</span>
              </div>
              {word.assigned ? (
                <form action={unassignVocabularyWordAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="wordId" value={word.id} />
                  <button className="button-secondary library-word-button" type="submit">Unassign from child</button>
                </form>
              ) : (
                <form action={assignVocabularyWordAction}>
                  <input type="hidden" name="learnerId" value={learnerId} />
                  <input type="hidden" name="wordId" value={word.id} />
                  <button className="button library-word-button" type="submit">Add to child</button>
                </form>
              )}
            </article>
          ))
        ) : (
          <p className="empty-state" style={{ gridColumn: "1 / -1" }}>
            {searchQuery.trim()
              ? `No shared vocabulary words match "${searchQuery.trim()}".`
              : "No shared vocabulary words are available yet."}
          </p>
        )}
      </section>
    </>
  );
}
