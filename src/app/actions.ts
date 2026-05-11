"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createOrUpdateParentWord,
  importWordShells,
  recordRoundCardView,
  setVisualCuePreference,
  startRoundMeaningRecognition,
  startRoundMission,
  submitSessionAnswer,
  upsertParentExampleVisualCues
} from "@/lib/db/repository";
import {
  createOrUpdateParentSpellingItem,
  normaliseParentSpellingWord,
  startSpellingPractice,
  startSpellingMission,
  submitSpellingAnswer
} from "@/lib/db/spellingRepository";
import {
  PILOT_SESSION_COOKIE,
  getSessionTtlSeconds,
  parsePilotSession,
  normalisePilotAccessCode,
  resolvePilotRole,
  roleHomePath,
  serializePilotSession
} from "@/lib/pilotAuth";
import type { ParentWordAssistDraft } from "@/lib/wordGeneration/parentAssist";

async function setPilotCookie(accessCode: string, role: "child" | "parent"): Promise<void> {
  const jar = await cookies();
  const h = await headers();
  const forwardProto = h.get("x-forwarded-proto");
  const isSecure = forwardProto ? forwardProto.split(",")[0]?.trim() === "https" : false;

  jar.set({
    name: PILOT_SESSION_COOKIE,
    value: serializePilotSession({ accessCode, role }),
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecure,
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
  const sessionId = startRoundMission(12);
  redirect(`/child/session/${sessionId}`);
}

export async function startSpellingMissionAction(): Promise<void> {
  await requireRole("child");
  const sessionId = startSpellingMission(8);
  redirect(`/child/spelling/session/${sessionId}`);
}

export async function startSpellingPracticeAction(formData: FormData): Promise<void> {
  await requireRole("child");
  const sessionId = String(formData.get("sessionId") ?? "");
  startSpellingPractice(sessionId);
  redirect(`/child/spelling/session/${sessionId}`);
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

export async function setVisualCuesAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  setVisualCuePreference({
    learnCards: formData.get("visualCueLearnCards") === "on",
    meaningQuestions: formData.get("visualCueMeaningQuestions") === "on",
    contextQuestions: formData.get("visualCueContextQuestions") === "on"
  });
  redirect("/parent");
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

  if (result.isCorrect && result.questionType === "fill_sentence" && result.attemptId) {
    redirect(`/child/session/${sessionId}?attemptId=${result.attemptId}`);
  }

  if (result.isCorrect) {
    if (result.completed) {
      redirect(`/child/session/${sessionId}/summary`);
    }
    const repairMarker =
      result.roundStep && result.passNumber && result.passNumber > 1
        ? `?repair=${encodeURIComponent(`${result.roundStep}-${result.passNumber}`)}`
        : "";
    redirect(`/child/session/${sessionId}${repairMarker}`);
  }

  if (result.completed && result.isCorrect !== false) {
    redirect(`/child/session/${sessionId}/summary`);
  }

  redirect(
    result.attemptId
      ? `/child/session/${sessionId}?attemptId=${result.attemptId}`
      : `/child/session/${sessionId}`
  );
}

export async function submitSpellingAnswerAction(formData: FormData): Promise<void> {
  await requireRole("child");
  const sessionId = String(formData.get("sessionId") ?? "");
  const submittedAnswer = String(formData.get("answer") ?? "");
  const responseTimeMs = Number(formData.get("responseTimeMs") ?? 0);

  const result = submitSpellingAnswer({
    sessionId,
    submittedAnswer,
    responseTimeMs: Number.isFinite(responseTimeMs) ? responseTimeMs : 0
  });

  if (result.completed) {
    redirect(
      result.attemptId
        ? `/child/spelling/session/${sessionId}?attemptId=${result.attemptId}`
        : `/child/spelling/session/${sessionId}`
    );
  }

  redirect(
    result.attemptId
      ? `/child/spelling/session/${sessionId}?attemptId=${result.attemptId}`
      : `/child/spelling/session/${sessionId}`
  );
}

export async function saveWordAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const submittedWord = String(formData.get("word") ?? "");
  const examples = formData
    .getAll("examples")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const synonyms = splitCommaList(String(formData.get("synonyms") ?? ""));
  const antonyms = splitCommaList(String(formData.get("antonyms") ?? ""));

  const wordId = createOrUpdateParentWord({
    word: submittedWord,
    definition: String(formData.get("definition") ?? ""),
    examples,
    synonyms,
    antonyms,
    difficultyLevel: 2
  });

  const draftPayload = String(formData.get("assistDraft") ?? "");
  if (draftPayload) {
    const draft = parseAssistDraft(draftPayload);
    if (draft && normalizeAssistWord(draft.word) === normalizeAssistWord(submittedWord)) {
      const cues = draft.examples.flatMap((example: ParentWordAssistDraft["examples"][number], index: number) => {
        if (example.sentence.trim() !== (examples[index] ?? "").trim()) return [];
        if (!example.visualCue) return [];
        return [
          {
            exampleIndex: index,
            provider: example.visualCue.provider,
            model: example.visualCue.model,
            promptVersion: example.visualCue.promptVersion,
            prompt: example.visualCue.prompt,
            imagePath: example.visualCue.imagePath
          }
        ];
      });
      upsertParentExampleVisualCues(wordId, cues);
    }
  }
  redirect("/parent/words");
}

export async function saveSpellingItemAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const itemId = String(formData.get("itemId") ?? "").trim();
  const target = normaliseParentSpellingWord(String(formData.get("target") ?? ""));
  const pairedTarget = String(formData.get("pairedTarget") ?? "");
  const usageLabel = String(formData.get("usageLabel") ?? "");
  const teachingNote = String(formData.get("teachingNote") ?? "");
  const sentences = formData
    .getAll("sentences")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  createOrUpdateParentSpellingItem({
    itemId: itemId || undefined,
    target,
    pairedTarget,
    usageLabel,
    teachingNote,
    sentences,
    difficultyLevel: 2
  });

  redirect("/parent/spelling");
}

export async function importWordsAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  importWordShells(String(formData.get("words") ?? ""));
  redirect("/parent/words");
}

function splitCommaList(value: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const entry of value.split(",")) {
    const clean = entry.trim();
    if (!clean) continue;
    const key = clean.toLocaleLowerCase("en-GB");
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(clean);
  }
  return results;
}

function parseAssistDraft(payload: string): ParentWordAssistDraft | null {
  try {
    const parsed = JSON.parse(payload) as unknown;
    if (!isAssistDraft(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeAssistWord(word: string): string {
  return word.trim().toLocaleLowerCase("en-GB").replace(/\s+/g, " ");
}

function isAssistDraft(value: unknown): value is ParentWordAssistDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<ParentWordAssistDraft>;
  return typeof draft.word === "string" && Array.isArray(draft.examples) && draft.examples.every(isAssistExample);
}

function isAssistExample(value: unknown): value is ParentWordAssistDraft["examples"][number] {
  if (!value || typeof value !== "object") return false;
  const example = value as Partial<ParentWordAssistDraft["examples"][number]>;
  return typeof example.sentence === "string" && (example.visualCue === null || isAssistVisualCue(example.visualCue));
}

function isAssistVisualCue(value: unknown): value is NonNullable<ParentWordAssistDraft["examples"][number]["visualCue"]> {
  if (!value || typeof value !== "object") return false;
  const cue = value as Partial<NonNullable<ParentWordAssistDraft["examples"][number]["visualCue"]>>;
  return (
    cue.provider === "gemini" &&
    typeof cue.model === "string" &&
    typeof cue.promptVersion === "string" &&
    typeof cue.prompt === "string" &&
    typeof cue.imagePath === "string"
  );
}
