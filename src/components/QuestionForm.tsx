"use client";

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
  const [hintLevel, setHintLevel] = useState(0);
  const responseTimeRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef<number>(Date.now());

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
      <input type="hidden" name="hintLevelUsed" value={hintLevel} />
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
        <div className="hint-ladder" aria-live="polite">
          <div className="hint-ladder-header">
            <strong>Hint ladder</strong>
            <span>
              {hintLevel} of {question.hints.length} opened
            </span>
          </div>
          {question.hints.map((hint, index) => {
            const isOpen = index < hintLevel;
            return (
              <div className={`hint-step${isOpen ? " hint-step-open" : ""}`} key={`${hint}-${index}`}>
                <span className="hint-index">Hint {index + 1}</span>
                <span>{isOpen ? hint : "Locked until you ask for the next hint."}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="action-row">
        <button
          className="button-secondary"
          type="button"
          onClick={() => setHintLevel((current) => Math.min(question.hints.length, current + 1))}
          disabled={hintLevel >= question.hints.length}
        >
          Hint
        </button>
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button" type="submit" disabled={pending}>
      {pending ? "Checking..." : "Submit"}
    </button>
  );
}
