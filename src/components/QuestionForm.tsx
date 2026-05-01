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

      {question.hints.length > 0 && hintLevel > 0 ? (
        <div className="hint-inline" aria-live="polite">
          <span className="hint-index">Hint {hintLevel}</span>
          <p>{question.hints[hintLevel - 1]}</p>
        </div>
      ) : null}

      <div className="question-actions">
        <button
          className="button-secondary"
          type="button"
          onClick={() => setHintLevel((current) => Math.min(question.hints.length, current + 1))}
          disabled={hintLevel >= question.hints.length}
        >
          {hintLevel === 0 ? "Use hint" : `Next hint ${hintLevel}/${question.hints.length}`}
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
