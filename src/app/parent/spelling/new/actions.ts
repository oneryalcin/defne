"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getParentSpellingItems, normaliseParentSpellingWord } from "@/lib/db/spellingRepository";
import { PILOT_SESSION_COOKIE, parsePilotSession } from "@/lib/pilotAuth";
import type { ParentSpellingAssistDraft } from "@/lib/wordGeneration/parentSpellingAssist";
import { generateParentSpellingAssistDraft } from "@/lib/wordGeneration/parentSpellingAssist";

export interface ParentSpellingAssistActionState {
  status: "idle" | "success" | "error";
  message: string | null;
  draft: ParentSpellingAssistDraft | null;
}

const INITIAL_STATE: ParentSpellingAssistActionState = {
  status: "idle",
  message: null,
  draft: null
};

export async function generateSpellingAssistAction(
  _previousState: ParentSpellingAssistActionState = INITIAL_STATE,
  formData: FormData
): Promise<ParentSpellingAssistActionState> {
  const jar = await cookies();
  const current = parsePilotSession(jar.get(PILOT_SESSION_COOKIE)?.value);
  if (!current || current.role !== "parent") {
    redirect("/");
  }

  const target = normaliseParentSpellingWord(String(formData.get("target") ?? ""));
  if (!target) {
    return { status: "error", message: "Enter a spelling word before generating.", draft: null };
  }

  const existing = getParentSpellingItems().find((item) => item.target.toLocaleLowerCase("en-GB") === target.toLocaleLowerCase("en-GB"));
  if (existing) {
    return {
      status: "error",
      message: `"${existing.target}" is already in the spelling list.`,
      draft: null
    };
  }

  try {
    const draft = await generateParentSpellingAssistDraft(target);
    return {
      status: "success",
      message: draft.warnings.length > 0 ? `Generated draft. ${draft.warnings.join(" ")}` : "Generated spelling draft.",
      draft
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Spelling generation failed.",
      draft: null
    };
  }
}
