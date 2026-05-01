"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createOrUpdateParentWord,
  importWordShells,
  recordRoundCardView,
  startRoundMeaningRecognition,
  startRoundMission,
  submitSessionAnswer
} from "@/lib/db/repository";
import {
  PILOT_SESSION_COOKIE,
  getSessionTtlSeconds,
  parsePilotSession,
  normalisePilotAccessCode,
  resolvePilotRole,
  roleHomePath,
  serializePilotSession
} from "@/lib/pilotAuth";

async function setPilotCookie(accessCode: string, role: "child" | "parent"): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: PILOT_SESSION_COOKIE,
    value: serializePilotSession({ accessCode, role }),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: getSessionTtlSeconds()
  });
}

async function requireRole(expectedRole: "child" | "parent"): Promise<void> {
  const jar = await cookies();
  const current = parsePilotSession(jar.get(PILOT_SESSION_COOKIE)?.value);
  if (!current || current.role !== expectedRole) {
    redirect("/");
  }
}

export async function loginAction(formData: FormData): Promise<void> {
  const accessCode = normalisePilotAccessCode(String(formData.get("accessCode") ?? ""));
  const role = resolvePilotRole(accessCode);
  const next = String(formData.get("next") ?? "");

  if (!role) {
    redirect("/?error=unknown_user");
  }

  await setPilotCookie(accessCode, role);
  redirect(next.startsWith("/") ? next : roleHomePath(role));
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.set({
    name: PILOT_SESSION_COOKIE,
    value: "",
    path: "/",
    maxAge: 0
  });
  redirect("/");
}

export async function startMissionAction(): Promise<void> {
  await requireRole("child");
  const sessionId = startRoundMission(8);
  redirect(`/child/session/${sessionId}`);
}

export async function recordCardViewAction(formData: FormData): Promise<void> {
  await requireRole("child");
  const sessionId = String(formData.get("sessionId") ?? "");
  const wordId = String(formData.get("wordId") ?? "");
  const returnToWordId = String(formData.get("returnToWordId") ?? "");
  recordRoundCardView(sessionId, wordId);
  redirect(returnToWordId ? `/child/session/${sessionId}?card=${encodeURIComponent(returnToWordId)}` : `/child/session/${sessionId}`);
}

export async function startMeaningRecognitionAction(formData: FormData): Promise<void> {
  await requireRole("child");
  const sessionId = String(formData.get("sessionId") ?? "");
  startRoundMeaningRecognition(sessionId);
  redirect(`/child/session/${sessionId}`);
}

export async function submitAnswerAction(formData: FormData): Promise<void> {
  await requireRole("child");
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

  redirect(
    result.attemptId
      ? `/child/session/${sessionId}?attemptId=${result.attemptId}`
      : `/child/session/${sessionId}/summary`
  );
}

export async function saveWordAction(formData: FormData): Promise<void> {
  await requireRole("parent");
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
  await requireRole("parent");
  importWordShells(String(formData.get("words") ?? ""));
  redirect("/parent/words");
}
