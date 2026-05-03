"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { saveWordAction } from "@/app/actions";
import { generateWordAssistAction, type ParentWordAssistActionState } from "@/app/parent/words/new/actions";

interface FormValues {
  word: string;
  definition: string;
  synonyms: string;
  antonyms: string;
  examples: string[];
}

const INITIAL_STATE: ParentWordAssistActionState = {
  status: "idle",
  message: null,
  draft: null
};

const EMPTY_VALUES: FormValues = {
  word: "",
  definition: "",
  synonyms: "",
  antonyms: "",
  examples: ["", "", ""]
};

export function AddWordForm() {
  const [assistState, assistAction, assistPending] = useActionState(generateWordAssistAction, INITIAL_STATE);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);

  useEffect(() => {
    if (!assistState.draft) return;
    setValues({
      word: assistState.draft.word,
      definition: assistState.draft.definition,
      synonyms: assistState.draft.synonyms.join(", "),
      antonyms: assistState.draft.antonyms.join(", "),
      examples: assistState.draft.examples.map((example) => example.sentence)
    });
  }, [assistState.draft]);

  const serialisedDraft = useMemo(
    () => (assistState.draft ? JSON.stringify(assistState.draft) : ""),
    [assistState.draft]
  );

  return (
    <div className="mission-panel parent-word-builder">
      <form action={assistAction} className="parent-word-builder__assist" aria-label="Generate word draft">
        <label className="parent-word-builder__word-field">
          Word
          <span className="parent-word-builder__generate-row">
            <input
              className="field"
              required
              name="word"
              placeholder="reluctant"
              value={values.word}
              onChange={(event) => setValues((current) => ({ ...current, word: event.target.value }))}
            />
            <button className="button" type="submit" disabled={assistPending}>
              {assistPending ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
              {assistPending ? "Generating..." : "Generate"}
            </button>
          </span>
        </label>
      </form>

      {assistState.message && assistState.status !== "success" ? (
        <div className={assistState.status === "error" ? "empty-state parent-word-builder__status is-error" : "empty-state"}>
          {assistState.message}
        </div>
      ) : null}

      <form action={saveWordAction} className="parent-word-builder__editor">
        <input type="hidden" name="assistDraft" value={serialisedDraft} readOnly />
        <input type="hidden" name="word" value={values.word} readOnly />

        <div className="form-grid">
          <label className="wide">
            Definition
            <textarea
              className="textarea parent-word-builder__definition-text"
              required
              name="definition"
              placeholder="not willing or not keen to do something"
              value={values.definition}
              onChange={(event) => setValues((current) => ({ ...current, definition: event.target.value }))}
            />
          </label>
          <label>
            Synonyms
            <input
              className="field"
              name="synonyms"
              placeholder="hesitant, wary"
              value={values.synonyms}
              onChange={(event) => setValues((current) => ({ ...current, synonyms: event.target.value }))}
            />
          </label>
          <label>
            Antonyms
            <input
              className="field"
              name="antonyms"
              placeholder="eager, willing"
              value={values.antonyms}
              onChange={(event) => setValues((current) => ({ ...current, antonyms: event.target.value }))}
            />
          </label>
        </div>

        <section className="parent-word-builder__examples" aria-labelledby="examples-title">
          <div className="parent-word-builder__section-label" id="examples-title">
            Examples
          </div>
          {values.examples.map((example, index) => {
            const cue = assistState.draft?.examples[index]?.visualCue ?? null;
            return (
              <div className={cue ? "parent-word-builder__example-row has-preview" : "parent-word-builder__example-row"} key={`example-${index}`}>
                <label>
                  Example {index + 1}
                  <textarea
                    className="textarea parent-word-builder__example-text"
                    required={index === 0}
                    name="examples"
                    placeholder={index === 0 ? "Aylin was reluctant to enter the dark room." : "Add another useful context."}
                    value={example}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        examples: current.examples.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry))
                      }))
                    }
                  />
                </label>
                {cue ? (
                  <figure className="parent-word-builder__inline-preview">
                    <Image
                      src={cue.imagePath}
                      alt={`Draft cue for example ${index + 1}`}
                      fill
                      sizes="160px"
                    />
                  </figure>
                ) : null}
              </div>
            );
          })}
        </section>

        <div className="action-row">
          <button className="button" type="submit">
            Save word
          </button>
          <Link className="button-secondary" href="/parent/words">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
