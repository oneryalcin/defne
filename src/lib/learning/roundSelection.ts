import type { PracticeWord, RoundSelectionReason, RoundSelectionReasonCode } from "../types";
import { scoreFromState } from "./scoring";

const RECOVERY_ACTIVE_WINDOW_DAYS = 14;
const R_FLOOR = 0.55;
const SUPPORTED_SUCCESS_INITIAL = 0.65;
const WRONG_OR_REVEAL_INITIAL = 0.45;
const FALLBACK_STABILITY_DAYS = 1.5;
const WRONG_RECALL_CAP = 0.65;
const REVEAL_RECALL_CAP = 0.5;
const ORDINARY_TAU_HOURS = 6;
const RECOVERY_TAU_HOURS = 0.75;
const INTRODUCTION_TAU_HOURS = 2;
const ORDINARY_RECENT_GATE_HOURS = 2;
const INTRODUCTION_RECENT_GATE_HOURS = 2;
const RECOVERY_MIN_HOURS = 0.25;
const RECOVERY_MIN_INTERVENING_INTERACTIONS = 7;
const STABLE_COLOURS = new Set(["light_green", "green"]);

export interface RoundRemediationEvidence {
  revealAndMoveOnWordIds: string[];
  eventuallyCorrectNotFirstAttemptWordIds: string[];
}

export interface RoundWordSelection {
  wordIds: string[];
  reasons: RoundSelectionReason[];
}

export type RoundSelectionBucket = "new" | "recovery" | "review" | "stable";

export interface RoundSelectionBucketTargets {
  new: number;
  recovery: number;
  review: number;
  stable: number;
}

export interface RoundSelectionOptions {
  bucketTargets?: Partial<RoundSelectionBucketTargets>;
  allowPartialCount?: boolean;
  reserveIntroduction?: boolean;
}

interface SelectionCaps {
  stableCap: number;
  greenCap: number;
  recoveryCap: number;
  introductionCap: number;
  veryHardCap: number;
}

interface SelectionFeatures {
  untouched: boolean;
  introducedOnly: boolean;
  hasRetrievalEvidence: boolean;
  activeRecovery: boolean;
  recovery: number;
  due: number;
  opportunity: number;
  weakness: number;
  novelty: number;
  proof: number;
  cooldown: number;
  veryLowRecall: boolean;
  stableOrMastered: boolean;
  greenMastered: boolean;
  tooEarlyStableReview: boolean;
  tooRecentOrdinary: boolean;
  tooRecentIntroduction: boolean;
  tooRecentRecovery: boolean;
  recall: number | null;
  targetRecall: number | null;
  utility: number;
}

type SelectionPass =
  | "strict_caps"
  | "relax_stable"
  | "relax_green_if_needed"
  | "relax_new"
  | "relax_recovery"
  | "relax_very_hard"
  | "emergency_too_recent";

interface Candidate {
  word: PracticeWord;
  features: SelectionFeatures;
  reason: RoundSelectionReason;
  jitter: number;
}

export function selectRoundWords(
  words: PracticeWord[],
  nowIso: string,
  targetCount: number,
  _remediation: RoundRemediationEvidence,
  options: RoundSelectionOptions = {}
): RoundWordSelection {
  const count = options.allowPartialCount
    ? Math.max(0, Math.min(12, Math.round(targetCount)))
    : Math.max(6, Math.min(12, Math.round(targetCount)));
  if (count === 0) return { wordIds: [], reasons: [] };
  const caps = scaledCaps(count);
  const candidates = words
    .map((word) => {
      const features = computeFeatures(word, nowIso);
      return {
        word,
        features,
        reason: reasonForWord(word, features),
        jitter: deterministicJitter(`${word.id}:${nowIso.slice(0, 10)}`)
      };
    })
    .sort(compareCandidates);

  const selected = new Map<string, Candidate>();
  const bucketTargets = normalizeBucketTargets(options.bucketTargets, count);
  if (bucketTargets) {
    for (const bucket of ["new", "recovery", "review", "stable"] as const) {
      fillBucket(bucket, bucketTargets[bucket], candidates, selected, caps, count);
    }
    fillParentPreferredBackfill(bucketTargets, candidates, selected, caps, count);
  } else if (options.reserveIntroduction !== false) {
    const introduction = candidates.find(
      (candidate) =>
        (candidate.features.untouched || candidate.features.introducedOnly) &&
        allowedUnderPass(candidate, [], caps, "strict_caps")
    );
    if (introduction) selected.set(introduction.word.id, introduction);
  }
  const passes: SelectionPass[] = [
    "strict_caps",
    "relax_stable",
    "relax_green_if_needed",
    "relax_new",
    // Current child mission is retrieval-first; relax recovery before adding
    // extra very-low-recall items that need scaffolded relearning.
    "relax_recovery",
    "relax_very_hard",
    "emergency_too_recent"
  ];

  for (const pass of passes) {
    for (const candidate of candidates) {
      if (selected.size >= count) break;
      if (selected.has(candidate.word.id)) continue;
      if (bucketTargets && bucketTargets[bucketForFeatures(candidate.features)] === 0) continue;
      if (!allowedUnderPass(candidate, [...selected.values()], caps, pass)) continue;
      selected.set(candidate.word.id, candidate);
    }
    if (selected.size >= count) break;
  }

  if (bucketTargets && selected.size < count) {
    for (const pass of passes) {
      for (const candidate of candidates) {
        if (selected.size >= count) break;
        if (selected.has(candidate.word.id)) continue;
        if (!allowedUnderPass(candidate, [...selected.values()], caps, pass)) continue;
        selected.set(candidate.word.id, candidate);
      }
      if (selected.size >= count) break;
    }
  }

  const picked = [...selected.values()];
  return {
    wordIds: picked.map((candidate) => candidate.word.id),
    reasons: picked.map((candidate) => candidate.reason)
  };
}

export function selectionBucketForWord(word: PracticeWord, nowIso: string): RoundSelectionBucket {
  return bucketForFeatures(computeFeatures(word, nowIso));
}

function normalizeBucketTargets(
  targets: Partial<RoundSelectionBucketTargets> | undefined,
  count: number
): RoundSelectionBucketTargets | null {
  if (!targets) return null;
  const normalized = {
    new: Math.max(0, Math.round(targets.new ?? 0)),
    recovery: Math.max(0, Math.round(targets.recovery ?? 0)),
    review: Math.max(0, Math.round(targets.review ?? 0)),
    stable: Math.max(0, Math.round(targets.stable ?? 0))
  };
  let remaining = count;
  for (const bucket of ["new", "recovery", "review", "stable"] as const) {
    const value = Math.min(normalized[bucket], remaining);
    normalized[bucket] = value;
    remaining -= value;
  }
  return normalized;
}

function fillBucket(
  bucket: RoundSelectionBucket,
  target: number,
  candidates: Candidate[],
  selected: Map<string, Candidate>,
  caps: SelectionCaps,
  maxSelected: number
): void {
  if (target <= 0) return;
  let picked = [...selected.values()].filter((candidate) => bucketForFeatures(candidate.features) === bucket).length;
  const passes: SelectionPass[] =
    bucket === "new"
      ? ["strict_caps", "relax_new"]
      : bucket === "recovery"
        ? ["strict_caps", "relax_recovery"]
        : bucket === "stable"
          ? ["strict_caps", "relax_stable", "relax_green_if_needed"]
          : ["strict_caps", "relax_very_hard"];
  for (const pass of passes) {
    for (const candidate of candidates) {
      if (selected.size >= maxSelected) break;
      if (picked >= target) break;
      if (selected.has(candidate.word.id)) continue;
      if (bucketForFeatures(candidate.features) !== bucket) continue;
      if (!allowedUnderPass(candidate, [...selected.values()], caps, pass)) continue;
      selected.set(candidate.word.id, candidate);
      picked += 1;
    }
    if (selected.size >= maxSelected || picked >= target) break;
  }
}

function fillParentPreferredBackfill(
  bucketTargets: RoundSelectionBucketTargets,
  candidates: Candidate[],
  selected: Map<string, Candidate>,
  caps: SelectionCaps,
  count: number
): void {
  for (const bucket of ["new", "recovery", "review", "stable"] as const) {
    if (selected.size >= count) break;
    if (bucketTargets[bucket] <= 0) continue;
    fillBucket(bucket, count, candidates, selected, caps, count);
  }
}

function bucketForFeatures(features: SelectionFeatures): RoundSelectionBucket {
  if (features.untouched || features.introducedOnly) return "new";
  if (features.activeRecovery) return "recovery";
  if (features.stableOrMastered) return "stable";
  return "review";
}

function scaledCaps(count: number): SelectionCaps {
  return {
    stableCap: Math.min(3, Math.ceil(0.25 * count)),
    greenCap: Math.min(1, Math.ceil(0.1 * count)),
    recoveryCap: Math.min(4, Math.ceil(0.35 * count)),
    introductionCap: Math.min(3, Math.ceil(0.25 * count)),
    veryHardCap: Math.min(2, Math.ceil(0.2 * count))
  };
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const diff = b.features.utility - a.features.utility;
  if (diff !== 0) return diff;
  return b.jitter - a.jitter;
}

function allowedUnderPass(
  candidate: Candidate,
  selected: Candidate[],
  caps: SelectionCaps,
  pass: SelectionPass
): boolean {
  if (candidate.features.tooRecentRecovery && pass !== "emergency_too_recent") return false;
  if (candidate.features.tooRecentOrdinary && pass !== "emergency_too_recent") return false;
  if (candidate.features.tooRecentIntroduction && pass !== "emergency_too_recent") return false;
  if (candidate.features.tooEarlyStableReview && pass !== "emergency_too_recent") return false;

  const next = [...selected, candidate];
  const stable = next.filter((item) => item.features.stableOrMastered).length;
  const green = next.filter((item) => item.features.greenMastered).length;
  const recovery = next.filter((item) => item.features.activeRecovery).length;
  const introduction = next.filter((item) => item.features.untouched || item.features.introducedOnly).length;
  const veryHard = next.filter((item) => item.features.veryLowRecall).length;

  if (stable > caps.stableCap && pass === "strict_caps") return false;
  if (green > caps.greenCap && pass !== "relax_green_if_needed" && pass !== "emergency_too_recent") return false;
  if (introduction > caps.introductionCap && pass !== "relax_new" && pass !== "relax_recovery" && pass !== "relax_very_hard" && pass !== "emergency_too_recent") return false;
  if (recovery > caps.recoveryCap && pass !== "relax_recovery" && pass !== "relax_very_hard" && pass !== "emergency_too_recent") return false;
  if (veryHard > caps.veryHardCap && pass !== "relax_very_hard" && pass !== "emergency_too_recent") return false;

  return true;
}

export function computeFeatures(word: PracticeWord, nowIso: string): SelectionFeatures {
  const state = word.state;
  const untouched = !state.lastExposedAt && state.attemptCount === 0;
  const introducedOnly = Boolean(state.lastExposedAt) && state.attemptCount === 0;
  const hasRetrievalEvidence =
    state.attemptCount > 0 ||
    Boolean(state.lastCleanRetrievalAt || state.lastSupportedSuccessAt || state.lastWrongAt || state.lastRevealedAt);
  const lastFailureAt = latestIso(state.lastWrongAt, state.lastRevealedAt);
  const rawRecoveryDebt = Math.max(0, state.recoveryDebt);
  const activeRecovery =
    rawRecoveryDebt > 0 && daysSince(lastFailureAt, nowIso) <= RECOVERY_ACTIVE_WINDOW_DAYS;
  const recovery = activeRecovery ? Math.min(rawRecoveryDebt, 3) / 3 : 0;
  const stableOrMastered = STABLE_COLOURS.has(state.masteryColour);
  const greenMastered = state.masteryColour === "green";
  const tooEarlyStableReview =
    stableOrMastered &&
    Boolean(state.nextReviewAt) &&
    new Date(state.nextReviewAt as string).getTime() > new Date(nowIso).getTime();

  let recall: number | null = null;
  let targetRecall: number | null = null;
  let due = 0;
  let opportunity = 0;
  let novelty = 0;
  let weakness = 0;
  let veryLowRecall = false;

  if (untouched || introducedOnly || !hasRetrievalEvidence) {
    novelty = 0.6 + 0.4 * Math.min(1, daysSince(state.lastExposedAt, nowIso) / 7);
  } else {
    targetRecall = targetRecallForWord(word);
    recall = predictedRecall(word, nowIso);
    if (recall < R_FLOOR) veryLowRecall = true;
    due = boundedDuePressure(recall, targetRecall);
    opportunity = veryLowRecall ? 0 : opportunityAtTarget(recall, targetRecall);
    weakness = 1 - scoreFromState(state, null, nowIso).lowerBound;
  }

  const proof = proofPointPressure(word, nowIso, recovery);
  const cooldown = cooldownMultiplier(word, nowIso, { untouched, introducedOnly, activeRecovery });
  const tooRecentRecovery = activeRecovery && hoursSince(latestIso(lastFailureAt, state.lastExposedAt, state.lastPracticedAt), nowIso) < RECOVERY_MIN_HOURS;
  const tooRecentIntroduction =
    introducedOnly && hoursSince(state.lastExposedAt, nowIso) < INTRODUCTION_RECENT_GATE_HOURS;
  const tooRecentOrdinary =
    !introducedOnly &&
    !activeRecovery &&
    !untouched &&
    hoursSince(state.lastPracticedAt, nowIso) < ORDINARY_RECENT_GATE_HOURS;
  const baseUtility =
    3 * recovery +
    1.4 * due +
    0.7 * opportunity +
    0.8 * weakness +
    0.7 * novelty +
    0.4 * proof;
  const hardnessMultiplier = veryLowRecall ? 0.35 : 1;
  const utility = finiteOrZero(cooldown * hardnessMultiplier * baseUtility);

  return {
    untouched,
    introducedOnly,
    hasRetrievalEvidence,
    activeRecovery,
    recovery,
    due,
    opportunity,
    weakness,
    novelty,
    proof,
    cooldown,
    veryLowRecall,
    stableOrMastered,
    greenMastered,
    tooEarlyStableReview,
    tooRecentOrdinary,
    tooRecentIntroduction,
    tooRecentRecovery,
    recall,
    targetRecall,
    utility
  };
}

function predictedRecall(word: PracticeWord, nowIso: string): number {
  const state = word.state;
  let recall: number;

  if (state.lastCleanRetrievalAt) {
    recall = Math.exp(-daysSince(state.lastCleanRetrievalAt, nowIso) / Math.max(1, state.stabilityDays));
  } else if (state.lastSupportedSuccessAt) {
    recall =
      SUPPORTED_SUCCESS_INITIAL *
      Math.exp(-daysSince(state.lastSupportedSuccessAt, nowIso) / FALLBACK_STABILITY_DAYS);
  } else {
    const lastFailureAt = latestIso(state.lastWrongAt, state.lastRevealedAt);
    recall =
      WRONG_OR_REVEAL_INITIAL *
      Math.exp(-daysSince(lastFailureAt, nowIso) / FALLBACK_STABILITY_DAYS);
  }

  if (state.lastCleanRetrievalAt && state.lastWrongAt && isAfter(state.lastWrongAt, state.lastCleanRetrievalAt)) {
    recall = Math.min(recall, WRONG_RECALL_CAP);
  }
  if (state.lastCleanRetrievalAt && state.lastRevealedAt && isAfter(state.lastRevealedAt, state.lastCleanRetrievalAt)) {
    recall = Math.min(recall, REVEAL_RECALL_CAP);
  }

  return Math.max(0.05, Math.min(0.95, finiteOrZero(recall)));
}

function targetRecallForWord(word: PracticeWord): number {
  if (word.state.recoveryDebt > 0 || word.state.masteryColour === "red" || word.state.masteryColour === "orange") {
    return 0.8;
  }
  if (word.state.masteryColour === "light_green") return 0.88;
  if (word.state.masteryColour === "green") return 0.9;
  return 0.82;
}

function boundedDuePressure(recall: number, targetRecall: number): number {
  if (recall >= targetRecall) return 0;
  return Math.max(0, Math.min(1, Math.log(targetRecall / recall) / Math.log(targetRecall / R_FLOOR)));
}

function opportunityAtTarget(recall: number, targetRecall: number): number {
  const r = Math.max(0.01, Math.min(0.99, recall));
  const target = Math.max(0.6, Math.min(0.95, targetRecall));
  const a = target / (1 - target);
  const logRaw = a * Math.log(r) + Math.log(1 - r);
  const logPeak = a * Math.log(target) + Math.log(1 - target);
  return Math.max(0, Math.min(1, finiteOrZero(Math.exp(logRaw - logPeak))));
}

function proofPointPressure(word: PracticeWord, nowIso: string, recovery: number): number {
  if (recovery > 0) return 0;
  if (daysSince(word.state.lastPracticedAt, nowIso) < 1) return 0;
  const confidence = scoreFromState(word.state, null, nowIso).lowerBound;
  return (confidence >= 0.62 && confidence < 0.72) || (confidence >= 0.76 && confidence < 0.86) ? 1 : 0;
}

function cooldownMultiplier(
  word: PracticeWord,
  nowIso: string,
  flags: Pick<SelectionFeatures, "untouched" | "introducedOnly" | "activeRecovery">
): number {
  if (flags.untouched) return 1;
  let relevantEvent: string | null = null;
  let tau = ORDINARY_TAU_HOURS;

  if (flags.introducedOnly) {
    relevantEvent = word.state.lastExposedAt;
    tau = INTRODUCTION_TAU_HOURS;
  } else if (flags.activeRecovery) {
    relevantEvent = latestIso(word.state.lastWrongAt, word.state.lastRevealedAt, word.state.lastExposedAt, word.state.lastPracticedAt);
    tau = RECOVERY_TAU_HOURS;
  } else {
    relevantEvent = word.state.lastPracticedAt;
  }

  if (!relevantEvent) return 1;
  return Math.max(0, Math.min(1, 1 - Math.exp(-hoursSince(relevantEvent, nowIso) / tau)));
}

function reasonForWord(word: PracticeWord, features: SelectionFeatures): RoundSelectionReason {
  let reason: RoundSelectionReasonCode = "useful_practice";
  let label = "Useful practice";
  let detail = "This word has a good balance of learning value and mission fit.";

  if (features.activeRecovery) {
    reason = "mistake_recovery";
    label = "Needs mistake recovery";
    detail = "A recent miss or reveal still needs clean spaced retrieval.";
  } else if (features.untouched || features.introducedOnly) {
    reason = "new_word";
    label = "New word";
    detail = "This word is ready for introduction before normal review scoring applies.";
  } else if (features.veryLowRecall) {
    reason = "needs_relearning";
    label = "Needs relearning";
    detail = "Recall looks very low, so this should be handled as scaffolded relearning.";
  } else if (features.stableOrMastered && features.due > 0) {
    reason = "stable_check";
    label = "Stable check";
    detail = "This stable word has decayed enough to deserve a quick check.";
  } else if (features.due >= 0.5) {
    reason = "scheduled_review";
    label = "Scheduled review";
    detail = "Predicted recall has fallen below the target range.";
  } else if (features.proof > 0) {
    reason = "almost_secure";
    label = "Almost secure";
    detail = "This word is close to the next mastery threshold and needs a clean proof point.";
  }

  return { wordId: word.id, word: word.word, reason, label, detail };
}

function deterministicJitter(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_295 / 1000;
}

function latestIso(...values: Array<string | null | undefined>): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!latest || isAfter(value, latest)) latest = value;
  }
  return latest;
}

function isAfter(a: string, b: string): boolean {
  return new Date(a).getTime() > new Date(b).getTime();
}

function daysSince(fromIso: string | null | undefined, toIso: string): number {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  return Math.max(0, (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

function hoursSince(fromIso: string | null | undefined, toIso: string): number {
  if (!fromIso) return Number.POSITIVE_INFINITY;
  return daysSince(fromIso, toIso) * 24;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
