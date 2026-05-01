"use client";

import { ArrowRight, ChevronDown, Lock } from "lucide-react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { submitAnswerAction } from "@/app/actions";
import type { PracticeQuestion } from "@/lib/learning/questions";

export function QuestionForm({
  sessionId,
  question
}: {
  sessionId: string;
  question: PracticeQuestion;
}) {
  const [openHints, setOpenHints] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const responseTimeRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef<number>(Date.now());

  const toggleHint = (index: number) =>
    setOpenHints((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const highestOpened = openHints.size > 0 ? Math.max(...openHints) + 1 : 0;
  const passage = sentenceFromQuestion(question);
  // Fill-in-the-blank questions hide the answer in the prompt; everything else
  // can show the target word as a heading.
  const showWordHeading = question.questionType !== "fill_sentence";

  return (
    <form
      action={submitAnswerAction}
      onSubmit={() => {
        if (responseTimeRef.current) {
          responseTimeRef.current.value = String(Date.now() - startedAtRef.current);
        }
      }}
    >
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="hintLevelUsed" value={highestOpened} />
      <input ref={responseTimeRef} type="hidden" name="responseTimeMs" value="0" />

      <div className="practice-cols">
        <div className="practice-main">
          <div>
            <p className="practice-instruction">{question.instruction}</p>
            {showWordHeading ? (
              <h2 className="practice-word">{question.targetWord}</h2>
            ) : null}
          </div>

          {passage ? (
            <blockquote className="story-sentence">
              {passage.before}
              <span className="target target--blank" aria-label="Missing word">
                _____
              </span>
              {passage.after}
            </blockquote>
          ) : (
            <p className="practice-instruction">{question.prompt}</p>
          )}

          {question.answerMode === "choice" ? (
            <ol className="choice-rows" role="listbox" aria-label="Answer choices">
              {question.choices.map((choice, idx) => {
                const letter = String.fromCharCode(65 + idx);
                const isSelected = selected === choice;
                return (
                  <li key={choice}>
                    <label
                      className={`choice-row${isSelected ? " is-selected" : ""}`}
                    >
                      <input
                        required
                        type="radio"
                        name="answer"
                        value={choice}
                        checked={isSelected}
                        onChange={() => setSelected(choice)}
                        style={{ position: "absolute", opacity: 0, pointerEvents: "none" }}
                      />
                      <span className="choice-row__letter">{letter}</span>
                      <span className="choice-row__text">{choice}</span>
                      <span className="choice-row__tag" />
                    </label>
                  </li>
                );
              })}
            </ol>
          ) : (
            <input
              className="text-answer"
              required
              autoComplete="off"
              spellCheck={false}
              name="answer"
              placeholder="Type the word"
            />
          )}
        </div>

        {question.hints.length > 0 ? (
          <aside className="practice-rail">
            <HintLadder
              hints={question.hints}
              openSet={openHints}
              onToggle={toggleHint}
            />
          </aside>
        ) : null}
      </div>

      <footer className="page-actions">
        <span className="page-actions__leader">Read the sentence carefully.</span>
        <SubmitButton />
      </footer>
    </form>
  );
}

function HintLadder({
  hints,
  openSet,
  onToggle
}: {
  hints: string[];
  openSet: Set<number>;
  onToggle: (index: number) => void;
}) {
  return (
    <section className="ladder" aria-label="Hint ladder">
      <header className="ladder__head">
        <span className="ladder__title">Hint</span>
        <span className="ladder__sub">{openSet.size} of {hints.length}</span>
      </header>
      <ol className="ladder__list">
        {hints.map((hint, index) => {
          const isOpen = openSet.has(index);
          return (
            <li key={index}>
              <button
                type="button"
                className={`rung--card${isOpen ? " is-open" : ""}`}
                onClick={() => onToggle(index)}
                aria-expanded={isOpen}
              >
                <span className="rung__body">
                  <span className="rung__kind">Hint {index + 1}</span>
                  <p className="rung__text">{isOpen ? hint : "tap to open"}</p>
                </span>
                <span className="rung__icon" aria-hidden="true">
                  {isOpen ? <ChevronDown size={16} /> : <Lock size={16} />}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="ribbon" type="submit" disabled={pending}>
      {pending ? "Checking..." : "That's my answer"}
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}

function sentenceFromQuestion(
  question: PracticeQuestion
): { before: string; after: string } | null {
  if (question.questionType !== "fill_sentence") return null;
  const blank = "_____";
  const idx = question.prompt.indexOf(blank);
  if (idx === -1) return null;
  return {
    before: question.prompt.slice(0, idx),
    after: question.prompt.slice(idx + blank.length),
  };
}
