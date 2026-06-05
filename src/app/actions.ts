"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createOrUpdateParentWord,
  importWordShells,
  recordRoundCardView,
  setNextRoundMixPreference,
  setVisualCuePreference,
  startRoundMeaningRecognition,
  startRoundMission,
  submitSessionAnswer,
  updateParentWord,
  upsertParentExampleVisualCues
} from "@/lib/db/repository";
import {
  assignVocabularyWordToLearner,
  createLearner,
  getLearnerAccessByCode,
  learnerExists,
  clearVocabularyWordPriority,
  requestVocabularyWordNextRound,
  resolveSelectedLearnerId,
  unassignVocabularyWordFromLearner
} from "@/lib/db/learners";
import {
  assignSpellingItemToLearner,
  clearSpellingItemPriority,
  createOrUpdateParentSpellingItem,
  normaliseParentSpellingWord,
  requestSpellingItemNextRound,
  startSpellingPractice,
  startSpellingMission,
  submitSpellingAnswer,
  unassignSpellingItemFromLearner
} from "@/lib/db/spellingRepository";
import { normaliseParentVocabularyWord } from "@/lib/normalization";
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

async function setPilotCookie(accessCode: string, role: "child" | "parent", learnerId?: string): Promise<void> {
  const jar = await cookies();
  const h = await headers();
  const forwardProto = h.get("x-forwarded-proto");
  const isSecure = forwardProto ? forwardProto.split(",")[0]?.trim() === "https" : false;

  jar.set({
    name: PILOT_SESSION_COOKIE,
    value: serializePilotSession({ accessCode, role, learnerId }),
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

async function requireChildLearnerId(): Promise<string> {
  const jar = await cookies();
  const current = parsePilotSession(jar.get(PILOT_SESSION_COOKIE)?.value);
  if (!current || current.role !== "child" || !current.learnerId) {
    const access = current?.role === "child" ? getLearnerAccessByCode(current.accessCode) : null;
    if (access) return access.learnerId;
    redirect("/");
  }
  if (!learnerExists(current.learnerId)) redirect("/");
  return current.learnerId;
}

export async function loginAction(formData: FormData): Promise<void> {
  const accessCode = normalisePilotAccessCode(String(formData.get("accessCode") ?? ""));
  const childAccess = getLearnerAccessByCode(accessCode);
  const role = childAccess ? "child" : resolvePilotRole(accessCode);
  const next = String(formData.get("next") ?? "");

  if (!role) {
    redirect("/?error=unknown_user");
  }

  await setPilotCookie(accessCode, role, childAccess?.learnerId);
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
  const learnerId = await requireChildLearnerId();
  const sessionId = startRoundMission(12, learnerId);
  redirect(`/child/session/${sessionId}`);
}

export async function startSpellingMissionAction(): Promise<void> {
  const learnerId = await requireChildLearnerId();
  const sessionId = startSpellingMission(8, learnerId);
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

export async function requestChildVocabularyWordNextRoundAction(formData: FormData): Promise<void> {
  const learnerId = await requireChildLearnerId();
  const wordId = String(formData.get("wordId") ?? "").trim();
  if (wordId) requestVocabularyWordNextRound(learnerId, wordId);
  revalidatePath("/child/words");
  if (wordId) revalidatePath(`/child/words/${wordId}`);
  redirect(wordId ? `/child/words/${encodeURIComponent(wordId)}` : "/child/words");
}

export async function clearChildVocabularyWordPriorityAction(formData: FormData): Promise<void> {
  const learnerId = await requireChildLearnerId();
  const wordId = String(formData.get("wordId") ?? "").trim();
  if (wordId) clearVocabularyWordPriority(learnerId, wordId);
  revalidatePath("/child/words");
  if (wordId) revalidatePath(`/child/words/${wordId}`);
  redirect(wordId ? `/child/words/${encodeURIComponent(wordId)}` : "/child/words");
}

export async function setVisualCuesAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  setVisualCuePreference({
    generationEnabled: formData.get("visualCueGeneration") === "on",
    learnCards: formData.get("visualCueLearnCards") === "on",
    meaningQuestions: formData.get("visualCueMeaningQuestions") === "on",
    contextQuestions: formData.get("visualCueContextQuestions") === "on"
  }, learnerId);
  redirect(`/parent?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function setNextRoundMixAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  setNextRoundMixPreference({
    new: Number(formData.get("nextRoundNew") ?? 0),
    recovery: Number(formData.get("nextRoundRecovery") ?? 0),
    review: Number(formData.get("nextRoundReview") ?? 0),
    stable: Number(formData.get("nextRoundStable") ?? 0)
  }, learnerId);
  revalidatePath("/parent");
  redirect(`/parent?learnerId=${encodeURIComponent(learnerId)}`);
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
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const existingWordId = String(formData.get("wordId") ?? "").trim();
  const submittedWord = normaliseParentVocabularyWord(String(formData.get("word") ?? ""));
  const examples = formData
    .getAll("examples")
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const synonyms = splitCommaList(String(formData.get("synonyms") ?? ""));
  const antonyms = splitCommaList(String(formData.get("antonyms") ?? ""));

  const wordInput = {
    word: submittedWord,
    definition: String(formData.get("definition") ?? ""),
    examples,
    synonyms,
    antonyms,
    difficultyLevel: 2
  };

  const wordId = existingWordId
    ? updateParentWord({ ...wordInput, wordId: existingWordId }, learnerId)
    : createOrUpdateParentWord(wordInput, learnerId);

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
  const returnTo = String(formData.get("returnTo") ?? "/parent/words");
  redirect(returnTo.startsWith("/parent/words") ? returnTo : "/parent/words");
}

export async function saveSpellingItemAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
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
  }, learnerId);

  redirect(`/parent/spelling?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function importWordsAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  importWordShells(String(formData.get("words") ?? ""), learnerId);
  redirect(`/parent/words?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function createChildAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = createLearner({
    displayName: String(formData.get("displayName") ?? ""),
    accessCode: String(formData.get("accessCode") ?? ""),
    yearGroup: String(formData.get("yearGroup") ?? "") || undefined
  });
  redirect(`/parent?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function assignVocabularyWordAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const wordId = String(formData.get("wordId") ?? "").trim();
  if (wordId) assignVocabularyWordToLearner(learnerId, wordId);
  redirect(`/parent/words?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function unassignVocabularyWordAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const wordId = String(formData.get("wordId") ?? "").trim();
  if (wordId) unassignVocabularyWordFromLearner(learnerId, wordId);
  redirect(`/parent/words?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function requestVocabularyWordNextRoundAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const wordId = String(formData.get("wordId") ?? "").trim();
  if (wordId) requestVocabularyWordNextRound(learnerId, wordId);
  redirect(`/parent/words?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function clearVocabularyWordPriorityAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const wordId = String(formData.get("wordId") ?? "").trim();
  if (wordId) clearVocabularyWordPriority(learnerId, wordId);
  redirect(`/parent/words?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function assignSpellingItemAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (itemId) assignSpellingItemToLearner(learnerId, itemId);
  redirect(`/parent/spelling?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function unassignSpellingItemAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (itemId) unassignSpellingItemFromLearner(learnerId, itemId);
  redirect(`/parent/spelling?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function requestSpellingItemNextRoundAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (itemId) requestSpellingItemNextRound(learnerId, itemId);
  redirect(`/parent/spelling?learnerId=${encodeURIComponent(learnerId)}`);
}

export async function clearSpellingItemPriorityAction(formData: FormData): Promise<void> {
  await requireRole("parent");
  const learnerId = resolveSelectedLearnerId(String(formData.get("learnerId") ?? ""));
  const itemId = String(formData.get("itemId") ?? "").trim();
  if (itemId) clearSpellingItemPriority(learnerId, itemId);
  redirect(`/parent/spelling?learnerId=${encodeURIComponent(learnerId)}`);
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
