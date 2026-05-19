"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { findActiveWordByText, getVisualCueGenerationPreference } from "@/lib/db/repository";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";
import { normaliseParentVocabularyWord } from "@/lib/normalization";
import type { ParentWordAssistDraft } from "@/lib/wordGeneration/parentAssist";
import { generateParentWordAssistDraft } from "@/lib/wordGeneration/parentAssist";

export interface ParentWordAssistActionState {
  status: "idle" | "success" | "error";
  message: string | null;
  draft: ParentWordAssistDraft | null;
}

const INITIAL_STATE: ParentWordAssistActionState = {
  status: "idle",
  message: null,
  draft: null
};

export async function generateWordAssistAction(
  _previousState: ParentWordAssistActionState = INITIAL_STATE,
  formData: FormData
): Promise<ParentWordAssistActionState> {
  const jar = await cookies();
  const current = parsePilotSession(jar.get(PILOT_SESSION_COOKIE)?.value);
  if (!current || current.role !== "parent") {
    redirect("/");
  }

  const word = normaliseParentVocabularyWord(String(formData.get("word") ?? ""));
  if (!word) {
    return { status: "error", message: "Enter a word before generating.", draft: null };
  }

  const existingWord = findActiveWordByText(word);
  if (existingWord) {
    return {
      status: "error",
      message: `"${existingWord.word}" is already in the vocabulary list.`,
      draft: null
    };
  }

  try {
    const draft = await generateParentWordAssistDraft(word, {
      generateImages: getVisualCueGenerationPreference()
    });
    const hasImagePreviews = draft.examples.some((example) => example.visualCue);
    return {
      status: "success",
      message:
        draft.warnings.length > 0
          ? `Generated text help. ${draft.warnings.join(" ")}`
          : hasImagePreviews
            ? "Generated draft content and image previews."
            : "Generated draft content.",
      draft
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Generation failed.",
      draft: null
    };
  }
}
