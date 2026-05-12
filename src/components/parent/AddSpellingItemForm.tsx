"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { saveSpellingItemAction } from "@/app/actions";
import {
  generateSpellingAssistAction,
  type ParentSpellingAssistActionState
} from "@/app/parent/spelling/new/actions";
import { normaliseParentSpellingWord as normalizeTarget } from "@/lib/normalization";

interface FormValues {
  target: string;
  pairedTarget: string;
  usageLabel: string;
  teachingNote: string;
  sentences: string[];
}

interface AddSpellingItemFormProps {
  initialValues?: FormValues;
  initialItemId?: string;
  mode?: "create" | "edit";
}

const INITIAL_STATE: ParentSpellingAssistActionState = {
  status: "idle",
  message: null,
  draft: null
};

const EMPTY_VALUES: FormValues = {
  target: "",
  pairedTarget: "",
  usageLabel: "",
  teachingNote: "",
  sentences: ["", ""]
};

export function AddSpellingItemForm({
  initialValues,
  initialItemId,
  mode = "create"
}: AddSpellingItemFormProps) {
  const [assistState, assistAction, assistPending] = useActionState(generateSpellingAssistAction, INITIAL_STATE);
  const [values, setValues] = useState<FormValues>(initialValues ?? EMPTY_VALUES);

  useEffect(() => {
    if (!assistState.draft) return;
    setValues({
      target: assistState.draft.target,
      pairedTarget: assistState.draft.pairedTarget,
      usageLabel: assistState.draft.usageLabel,
      teachingNote: assistState.draft.teachingNote,
      sentences: [assistState.draft.sentences[0] ?? "", assistState.draft.sentences[1] ?? ""]
    });
  }, [assistState.draft]);

  const generationMessage = useMemo(() => assistState.message, [assistState.message]);

  return (
    <div className="mission-panel parent-word-builder">
      {mode === "create" ? (
        <form action={assistAction} className="parent-word-builder__assist" aria-label="Generate spelling draft">
          <label className="parent-word-builder__word-field">
            Spelling word
            <span className="parent-word-builder__generate-row">
              <input
                className="field"
                required
                name="target"
                placeholder="advise"
                value={values.target}
                onChange={(event) => setValues((current) => ({ ...current, target: event.target.value }))}
                onBlur={() => setValues((current) => ({ ...current, target: normalizeTarget(current.target) }))}
              />
              <button className="button" type="submit" disabled={assistPending}>
                {assistPending ? <LoaderCircle size={18} className="spin" /> : <Sparkles size={18} />}
                {assistPending ? "Generating..." : "Generate"}
              </button>
            </span>
          </label>
        </form>
      ) : (
        <label className="parent-word-builder__word-field">
          Spelling word
          <span className="parent-word-builder__generate-row">
            <input
              className="field"
              required
              name="target"
              value={values.target}
              onChange={(event) => setValues((current) => ({ ...current, target: event.target.value }))}
              onBlur={() => setValues((current) => ({ ...current, target: normalizeTarget(current.target) }))}
            />
          </span>
        </label>
      )}

      {generationMessage && assistState.status !== "success" ? (
        <div className={assistState.status === "error" ? "empty-state parent-word-builder__status is-error" : "empty-state"}>
          {generationMessage}
        </div>
      ) : null}

      <form action={saveSpellingItemAction} className="parent-word-builder__editor">
        {mode === "create" ? <input type="hidden" name="target" value={normalizeTarget(values.target)} readOnly /> : null}
        {initialItemId ? <input type="hidden" name="itemId" value={initialItemId} readOnly /> : null}

        <div className="form-grid">
          <label>
            Pair or common confusion
            <input
              className="field"
              name="pairedTarget"
              placeholder="advice"
              value={values.pairedTarget}
              onChange={(event) => setValues((current) => ({ ...current, pairedTarget: event.target.value }))}
              onBlur={() => setValues((current) => ({ ...current, pairedTarget: normalizeTarget(current.pairedTarget) }))}
            />
          </label>
          <label>
            Grammar label
            <input
              className="field"
              required
              name="usageLabel"
              placeholder="verb"
              value={values.usageLabel}
              onChange={(event) => setValues((current) => ({ ...current, usageLabel: event.target.value }))}
            />
          </label>
          <label className="wide">
            Teaching note
            <textarea
              className="textarea parent-word-builder__definition-text"
              required
              name="teachingNote"
              placeholder="Advise is a verb. It means to give someone advice."
              value={values.teachingNote}
              onChange={(event) => setValues((current) => ({ ...current, teachingNote: event.target.value }))}
            />
          </label>
        </div>

        <section className="parent-word-builder__examples" aria-labelledby="spelling-sentences-title">
          <div className="parent-word-builder__section-label" id="spelling-sentences-title">
            Clean sentences
          </div>
          {values.sentences.map((sentence, index) => (
            <label key={`spelling-sentence-${index}`}>
              Sentence {index + 1}
              <textarea
                className="textarea parent-word-builder__example-text"
                required={index === 0}
                name="sentences"
                placeholder={index === 0 ? "The coach will advise the team before the race." : "Add another clean sentence."}
                value={sentence}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    sentences: current.sentences.map((entry, entryIndex) => (entryIndex === index ? event.target.value : entry))
                  }))
                }
              />
            </label>
          ))}
        </section>

        <div className="action-row">
          <button className="button" type="submit">
            {mode === "edit" ? "Save changes" : "Save spelling word"}
          </button>
          <Link className="button-secondary" href="/parent/spelling">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
