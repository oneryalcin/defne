"use server";

import { redirect } from "next/navigation";
import { createOrUpdateParentWord, importWordShells, startDailyMission, submitSessionAnswer } from "@/lib/db/repository";

export async function startMissionAction(): Promise<void> {
  const sessionId = startDailyMission(15);
  redirect(`/child/session/${sessionId}`);
}

export async function submitAnswerAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get("sessionId") ?? "");
  const submittedAnswer = String(formData.get("answer") ?? "");
  const hintLevelUsed = Number(formData.get("hintLevelUsed") ?? 0);
  const responseTimeMs = Number(formData.get("responseTimeMs") ?? 0);

  const result = submitSessionAnswer({
    sessionId,
    submittedAnswer,
    hintLevelUsed: Number.isFinite(hintLevelUsed) ? hintLevelUsed : 0,
    responseTimeMs: Number.isFinite(responseTimeMs) ? responseTimeMs : 0
  });

  redirect(result.completed ? `/child/session/${sessionId}/summary` : `/child/session/${sessionId}`);
}

export async function saveWordAction(formData: FormData): Promise<void> {
  createOrUpdateParentWord({
    word: String(formData.get("word") ?? ""),
    definition: String(formData.get("definition") ?? ""),
    example: String(formData.get("example") ?? ""),
    synonym: String(formData.get("synonym") ?? ""),
    antonym: String(formData.get("antonym") ?? ""),
    spellingNote: String(formData.get("spellingNote") ?? ""),
    confusable: String(formData.get("confusable") ?? ""),
    difficultyLevel: Number(formData.get("difficultyLevel") ?? 2)
  });
  redirect("/parent/words");
}

export async function importWordsAction(formData: FormData): Promise<void> {
  importWordShells(String(formData.get("words") ?? ""));
  redirect("/parent/words");
}
