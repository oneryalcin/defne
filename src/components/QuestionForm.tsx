"use client";

import { Lock, ChevronDown } from "lucide-react";
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
  const responseTimeRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef<number>(Date.now());

  const toggleHint = (index: number) => {
    setOpenHints((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };
  const highestOpened = openHints.size > 0 ? Math.max(...openHints) + 1 : 0;

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

      <p className="question-prompt">{question.prompt}</p>
      <p className="question-instruction">{question.instruction}</p>

      {question.answerMode === "choice" ? (
        <div className="choice-grid">
          {question.choices.map((choice) => (
            <label className="choice" key={choice}>
              <input required type="radio" name="answer" value={choice} />
              <span>{choice}</span>
            </label>
          ))}
        </div>
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

      {question.hints.length > 0 ? (
        <HintLadder
          hints={question.hints}
          openSet={openHints}
          onToggle={toggleHint}
        />
      ) : null}

      <div className="question-actions">
        <SubmitButton />
      </div>
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
        <span className="ladder__title">Hints — open one at a time, support not a shortcut</span>
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
    <button className="button button-large" type="submit" disabled={pending}>
      {pending ? "Checking..." : "That's my answer"}
    </button>
  );
}
