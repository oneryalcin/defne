import { scoreFromState } from "../src/lib/learning/scoring";
import type { AttemptRecord, LearnerWordState, MasteryColour } from "../src/lib/types";

const NOW = "2026-06-06T12:00:00.000Z";
const HALF_LIFE_DAYS = 7;
const HINT_LEVELS = 4;
const WILSON_Z = 0.84;

type ColourOrNone = MasteryColour | null;

interface Scenario {
  name: string;
  description: string;
  attempts: AttemptRecord[];
  stabilityDays: number;
  recoveryDebt?: number;
  nearReview?: boolean;
}

interface EvidenceModelResult {
  colour: ColourOrNone;
  confidence: number;
  pHat: number;
  effectiveCorrect: number;
  effectiveWrong: number;
  effectiveN: number;
  repairPrompts: number;
  note: string;
}

const modelVariants = [
  { name: "lightPrior", priorCorrect: 0.5, priorWrong: 0.5 },
  { name: "cautiousPrior", priorCorrect: 1.5, priorWrong: 1.5 }
] as const;

const scenarios: Scenario[] = [
  {
    name: "new_pair_clean",
    description: "Two clean corrects in one session",
    attempts: sequence([
      ["correct", -0.04],
      ["correct", 0]
    ]),
    stabilityDays: 1
  },
  {
    name: "four_clean_two_days",
    description: "Four clean corrects spread over two days",
    attempts: sequence([
      ["correct", -2],
      ["correct", -2],
      ["correct", 0],
      ["correct", 0]
    ]),
    stabilityDays: 2.2
  },
  {
    name: "twenty_correct_one_fresh_slip",
    description: "20 correct, one accidental miss just now",
    attempts: [
      ...repeatedCorrects(20, -10, -1),
      attempt("wrong", 0)
    ],
    stabilityDays: 14,
    recoveryDebt: 2,
    nearReview: true
  },
  {
    name: "twenty_two_correct_four_wrong_fresh_slip",
    description: "22 correct, 4 wrong, latest miss is fresh",
    attempts: [
      ...repeatedCorrects(22, -18, -1),
      attempt("wrong", -16),
      attempt("wrong", -12),
      attempt("wrong", -7),
      attempt("wrong", 0)
    ].sort(byAnsweredAt),
    stabilityDays: 18,
    recoveryDebt: 2,
    nearReview: true
  },
  {
    name: "three_correct_one_wrong",
    description: "Shallow history: 3 correct, 1 fresh wrong",
    attempts: sequence([
      ["correct", -2],
      ["correct", -1],
      ["correct", -0.5],
      ["wrong", 0]
    ]),
    stabilityDays: 2,
    recoveryDebt: 2,
    nearReview: true
  },
  {
    name: "old_mistakes_recovered",
    description: "Old mistakes followed by 20 clean corrects",
    attempts: [
      attempt("wrong", -18),
      attempt("wrong", -13),
      ...repeatedCorrects(20, -12, 0)
    ].sort(byAnsweredAt),
    stabilityDays: 30,
    recoveryDebt: 0,
    nearReview: false
  },
  {
    name: "hint_heavy_corrects",
    description: "Mostly correct, but with heavy hint use",
    attempts: [
      ...repeatedCorrects(6, -3, 0, 2),
      attempt("correct", 0, 3)
    ],
    stabilityDays: 6,
    recoveryDebt: 0,
    nearReview: false
  }
];

main();

function main(): void {
  const rows = scenarios.map((scenario) => {
    const state = stateFromScenario(scenario);
    const current = scoreFromState(state, scenario.attempts, NOW);
    const light = evidenceModel(scenario.attempts, modelVariants[0]);
    const cautious = evidenceModel(scenario.attempts, modelVariants[1]);
    return {
      scenario: scenario.name,
      currentColour: label(current.colour),
      currentConfidence: percent(current.lowerBound),
      lightPriorColour: label(light.colour),
      lightPriorConfidence: percent(light.confidence),
      cautiousPriorColour: label(cautious.colour),
      cautiousPriorConfidence: percent(cautious.confidence),
      repairPrompts: light.repairPrompts,
      effectiveN: light.effectiveN.toFixed(1),
      note: light.note
    };
  });

  console.log("\nMastery model simulation");
  console.log(`Now: ${NOW}`);
  console.log("\nCurrent scorer vs evidence-only Bayesian/Wilson model\n");
  console.table(rows);

  console.log("\nScenario details");
  for (const scenario of scenarios) {
    const current = scoreFromState(stateFromScenario(scenario), scenario.attempts, NOW);
    const light = evidenceModel(scenario.attempts, modelVariants[0]);
    const cautious = evidenceModel(scenario.attempts, modelVariants[1]);
    console.log(`\n${scenario.name}`);
    console.log(`  ${scenario.description}`);
    console.log(`  attempts: ${summary(scenario.attempts)}`);
    console.log(`  current: ${label(current.colour)} at ${percent(current.lowerBound)}`);
    console.log(
      `  light prior: ${label(light.colour)} at ${percent(light.confidence)}; repair prompts: ${light.repairPrompts}`
    );
    console.log(`  cautious prior: ${label(cautious.colour)} at ${percent(cautious.confidence)}`);
    console.log(`  note: ${light.note}`);
  }
}

function evidenceModel(
  attempts: AttemptRecord[],
  prior: { priorCorrect: number; priorWrong: number }
): EvidenceModelResult {
  const totals = weightedTotals(attempts);
  const effectiveCorrect = totals.correct + prior.priorCorrect;
  const effectiveWrong = totals.wrong + prior.priorWrong;
  const effectiveN = effectiveCorrect + effectiveWrong;
  const pHat = effectiveCorrect / effectiveN;
  const confidence = wilsonLower(pHat, effectiveN);
  const colour = colourFromConfidence(confidence);
  const latestWrongAgeHours = latestWrongAge(attempts);
  const deepHistory = attempts.length >= 10 && rawCorrectRatio(attempts) >= 0.8;
  const repairPrompts =
    latestWrongAgeHours !== null && latestWrongAgeHours <= 36
      ? deepHistory
        ? 1
        : 2
      : 0;

  return {
    colour,
    confidence,
    pHat,
    effectiveCorrect: totals.correct,
    effectiveWrong: totals.wrong,
    effectiveN: totals.correct + totals.wrong,
    repairPrompts,
    note:
      repairPrompts > 0
        ? "recent miss schedules repair, colour remains confidence-driven"
        : "no active repair; colour is confidence-driven"
  };
}

function colourFromConfidence(confidence: number): ColourOrNone {
  if (confidence >= 0.85) return "green";
  if (confidence >= 0.72) return "light_green";
  if (confidence >= 0.55) return "yellow";
  if (confidence >= 0.35) return "orange";
  return "red";
}

function weightedTotals(attempts: AttemptRecord[]): { correct: number; wrong: number } {
  let correct = 0;
  let wrong = 0;
  for (const item of attempts) {
    const ageDays = Math.max(0, (Date.parse(NOW) - Date.parse(item.answeredAt)) / 86_400_000);
    const recency = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    if (item.isCorrect) {
      const hintCredit = Math.max(0, 1 - item.hintLevelUsed / HINT_LEVELS);
      correct += recency * hintCredit;
    } else {
      wrong += recency;
    }
  }
  return { correct, wrong };
}

function wilsonLower(pHat: number, n: number): number {
  if (n <= 0) return 0;
  const center = pHat + (WILSON_Z * WILSON_Z) / (2 * n);
  const margin = WILSON_Z * Math.sqrt((pHat * (1 - pHat)) / n + (WILSON_Z * WILSON_Z) / (4 * n * n));
  const denom = 1 + (WILSON_Z * WILSON_Z) / n;
  return Math.max(0, (center - margin) / denom);
}

function stateFromScenario(scenario: Scenario): LearnerWordState {
  const correctCount = scenario.attempts.filter((item) => item.isCorrect).length;
  const wrongCount = scenario.attempts.length - correctCount;
  const lastSeenAt = scenario.attempts.at(-1)?.answeredAt ?? null;
  const lastCorrectAt = [...scenario.attempts].reverse().find((item) => item.isCorrect)?.answeredAt ?? null;
  const lastWrongAt = [...scenario.attempts].reverse().find((item) => !item.isCorrect)?.answeredAt ?? null;
  const averageHintLevelUsed =
    scenario.attempts.reduce((sum, item) => sum + item.hintLevelUsed, 0) / Math.max(1, scenario.attempts.length);

  return {
    id: `state_${scenario.name}`,
    learnerId: "learner_sim",
    wordId: `word_${scenario.name}`,
    stabilityDays: scenario.stabilityDays,
    masteryColour: "red",
    lastSeenAt,
    lastCorrectAt,
    lastWrongAt,
    nextReviewAt: null,
    attemptCount: scenario.attempts.length,
    correctCount,
    wrongCount,
    lastHintLevelUsed: scenario.attempts.at(-1)?.hintLevelUsed ?? null,
    averageHintLevelUsed,
    averageResponseTimeMs: 1200,
    failureTypes: [],
    confusedWithWordIds: [],
    nearReview: scenario.nearReview ?? false,
    eligibleQuestionsSinceLastMistake: cleanCorrectSinceLatestWrong(scenario.attempts),
    recoveryDebt: scenario.recoveryDebt ?? 0,
    lastPracticedAt: lastSeenAt,
    lastCleanRetrievalAt: lastCorrectAt,
    lastSupportedSuccessAt: null,
    lastRevealedAt: null,
    lastExposedAt: lastSeenAt,
    lastPracticedSessionId: null,
    lastPracticedInteractionIndex: null,
    learnerStateContentVersion: 1
  };
}

function cleanCorrectSinceLatestWrong(attempts: AttemptRecord[]): number {
  const latestWrong = [...attempts].reverse().findIndex((item) => !item.isCorrect);
  if (latestWrong === -1) return attempts.filter((item) => item.isCorrect).length;
  return attempts.slice(attempts.length - latestWrong).filter((item) => item.isCorrect).length;
}

function latestWrongAge(attempts: AttemptRecord[]): number | null {
  const latest = [...attempts].reverse().find((item) => !item.isCorrect);
  if (!latest) return null;
  return Math.max(0, (Date.parse(NOW) - Date.parse(latest.answeredAt)) / 3_600_000);
}

function rawCorrectRatio(attempts: AttemptRecord[]): number {
  return attempts.filter((item) => item.isCorrect).length / Math.max(1, attempts.length);
}

function repeatedCorrects(count: number, startDays: number, endDays: number, hintLevelUsed = 0): AttemptRecord[] {
  if (count <= 1) return [attempt("correct", endDays, hintLevelUsed)];
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    return attempt("correct", startDays + (endDays - startDays) * ratio, hintLevelUsed);
  });
}

function sequence(items: Array<["correct" | "wrong", number, number?]>): AttemptRecord[] {
  return items.map(([kind, daysFromNow, hintLevelUsed]) => attempt(kind, daysFromNow, hintLevelUsed));
}

function attempt(kind: "correct" | "wrong", daysFromNow: number, hintLevelUsed = 0): AttemptRecord {
  return {
    answeredAt: new Date(Date.parse(NOW) + daysFromNow * 86_400_000).toISOString(),
    isCorrect: kind === "correct",
    hintLevelUsed
  };
}

function byAnsweredAt(a: AttemptRecord, b: AttemptRecord): number {
  return Date.parse(a.answeredAt) - Date.parse(b.answeredAt);
}

function summary(attempts: AttemptRecord[]): string {
  const correct = attempts.filter((item) => item.isCorrect).length;
  return `${correct} correct / ${attempts.length - correct} wrong`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function label(colour: ColourOrNone): string {
  if (colour === null) return "not_started";
  return colour;
}
