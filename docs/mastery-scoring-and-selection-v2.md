# Mastery scoring v2

Status: shipped on `feat/defne-design-system`. This replaces the original
`min(meaning, usage, spelling)` colour rule documented in
`mastery-scoring-and-selection.md`.

## Why we rewrote it

The first version had two failure modes the user hit immediately:

1. **Spelling dragged everything down.** A word answered correctly three
   times for meaning still showed Red because `spelling = 0`. We don't
   actually test spelling in this app — we should never have penalised
   it.
2. **Old correct answers outweighed recent wrongs.** A word answered
   correctly five times last week, then missed twice today, was
   averaged into a "still mostly correct" state. That's the opposite of
   what a learner needs to see — recent failure means the word has been
   forgotten.

The replacement is built on three ideas:

- **Wilson lower bound, not naive ratio.** 1/1 isn't the same evidence
  as 5/5 — even though both have a mean of 1.0. The 80% one-sided
  Wilson score interval gives `wilson(1, 1) ≈ 0.59`, `wilson(1, 5) ≈
  0.85`. That's the number we bucket on.
- **Recency-weighted attempts.** Each correct/wrong is multiplied by
  `0.5^(age_days / 7)`. An attempt from a week ago counts half. Three
  weeks ago counts 1/8. Recent evidence dominates.
- **Recent-wrong knockdown.** Independent of the math: a wrong answer
  inside the last 36 hours forces the colour down one bucket. Even if
  the lower bound still puts a word in `light_green`, a fresh failure
  means the kid needs that word back tomorrow, not "occasional refresh."

## The pipeline

```
attempts          ─┐
   │               │
   ▼               ▼
recency-weight   firstAttemptsClean()
   │               │
   ▼               ▼
correctW, wrongs  bool
   │
   ▼
pHat = correctW / (correctW + wrongs)
   │
   ▼
wilson lower (z = 0.84)
   │
   ▼
× freshness(0.6 + 0.4·recall)   ← lastSeenAt + stabilityDays
   │
   ▼
lowerBound ──→ bucket ──→ knockdown ──→ colour
                  ▲
                  │
       firstAttemptsClean → Reliable floor
```

### Inputs read from `LearnerWordState` and `practice_attempts`

| Input | Source | Role |
|---|---|---|
| Per-attempt `(answeredAt, isCorrect, hintLevelUsed)` | `practice_attempts` rows | Drives the weighted ratio |
| `attemptCount`, `correctCount`, `wrongCount` | `learner_word_state` | Aggregate fallback for tests / non-DB callers |
| `averageHintLevelUsed` | `learner_word_state` | Disables the Reliable gate when > 0.5 |
| `lastSeenAt`, `stabilityDays` | `learner_word_state` | Freshness multiplier and selection priority |
| `lastWrongAt` | `learner_word_state` | Used by selection priority for the `recent-failure` bonus |

### The Reliable / Mastered gates

The Wilson bound alone is not enough — the spec is "two clean firsts →
Reliable; Reliable + decay survival → Mastered." So:

- **`firstAttemptsClean(state)`** = `attemptCount ≥ 2 AND correctCount ≥
  2 AND wrongCount === 0 AND averageHintLevelUsed ≤ 0.5`. When this is
  true, the colour is *at least* Reliable (`light_green`).
- **Mastered (`green`)** further requires `lowerBound ≥ 0.80`,
  `stabilityDays ≥ 7`, and `correctCount ≥ 4`. So a kid who answers
  "fast and clean" twice doesn't immediately leap to Mastered — they
  need to answer correctly *after a real gap* and accumulate evidence.

### Bucket thresholds

| Wilson lower bound (after freshness) | Colour | Label |
|---|---|---|
| `< 0.30` | `red` | Needs work |
| `< 0.55` | `orange` | Building |
| `< 0.70` | `yellow` | Nearly steady |
| `≥ 0.70` AND not clean firsts | `light_green` | Reliable (capped — never Mastered without clean firsts) |
| (clean firsts) | `light_green` (Reliable floor) | Reliable |
| (clean firsts) AND `≥ 0.80` AND `stabilityDays ≥ 7` AND `correctCount ≥ 4` | `green` | Mastered |

Then the recent-wrong knockdown: if any wrong answer in the last 36
hours, drop one bucket (Mastered → Reliable, Reliable → Nearly steady,
etc.). Red stays red.

## Selection priority

Same pipeline feeds the round selector via `priorityBreakdownForState`.
Each factor returns `(value, weight, contribution, note)` so the
parent dashboard / per-word page can render *why* the scheduler picked
a word. Factors:

- `due-by-decay`: `1 − exp(-daysSinceSeen / stabilityDays)`. The Ebbinghaus
  forgetting curve. Recently-seen words score low; long-ignored words
  score high.
- `confidence-gap`: `1 − lowerBound`. Words far from sure get more practice.
- `recent-failure`: bonus when `lastWrongAt` is fresh (decays over hours).
- `almost-mastered`: small bump when the lower bound is in
  `[0.55, 0.70)` so words on the edge get one more clean proof.
- `delayed-recall`: bump when ≥ 1 day has passed and recall has
  dropped below 0.72 — getting it now is stronger evidence than getting
  it back-to-back.
- `too-recent-penalty`: subtract when the word was seen in the last 12
  minutes and not missed. Avoids back-to-back asks of the same word.

For untouched words: a flat `0.4` so they're picked only when nothing
needier sits in the queue. For mastered (`green`) words: `0.05 + 0.15 *
(1 − recall)` so they only resurface as the curve decays.

## Why this is good enough (and where it isn't)

Good enough:

- **Honest about uncertainty.** 1/1 ≠ 5/5 ≠ 1/2. The Wilson interval is
  the right small-sample tool.
- **Forgetting is real.** The 7-day half-life captures it without needing
  per-attempt `daysSinceSeen` to be high-quality.
- **Explainable.** Every colour and every priority factor produces a
  human-readable line. Surface them on hover (heatmap), in the per-word
  page, and in the round preview.

Not good enough yet — backlog ideas:

- **Per-learner difficulty.** Right now every learner shares the same
  thresholds. With a population we could borrow strength (Bayesian
  knowledge tracing, IRT). Defer until there are 100s of learners.
- **Question-type differentiation.** A correct `definition_choice` and a
  correct `fill_sentence` count the same in this version. They probably
  shouldn't — production tasks are stronger evidence than recognition.
- **Hint-level discount.** Currently hints disable the Reliable gate but
  don't dampen the lower bound. We could make `hintFraction` reduce
  evidence weight (`weight × (1 − hintFraction)`) once hints are
  reliable enough that this matters.
- **Stability growth on clean correct.** Currently `stabilityDays` grows
  by × 1.4 on clean correct. We may want × 2 or × 3 to make Reliable
  → Mastered take a real week.

## Where the code lives

- `src/lib/learning/scoring.ts` — `scoreFromState`,
  `priorityBreakdownForState`. Pure; no DB.
- `src/lib/learning/mastery.ts` — `masteryColourForState`,
  `priorityScore` delegate to scoring.
- `src/lib/db/repository.ts` — `getParentWords`, `getMissionPreview`,
  `getWordDetail` fetch attempts and pass them in.

## Selection — eight slots, fifty-three contenders

The round selector picks the **top 8 priorityScore** from the deck.
That single fact does most of the work in answering "when will I see
this word again?":

- A word ranked 1–8 will surface in the next round (≈95–99% chance).
- A word at rank 9–12 has ~30–50% chance — it will surface if a top-8
  word is "too recent" or filtered out by the reason buckets.
- A word at rank 13–25 typically waits a few days for its dueScore
  (Ebbinghaus) to climb high enough to break into the top 12.
- A word past rank 25 is effectively dormant unless decay is severe.

Why does this matter? Because **all words compete with each other**.
If the deck is dense with Building/Nearly-steady words, untouched
ones may not surface at all until the older ones move up. That is
intentional — the spec says "deprioritise untouched below struggling."

## How to debug

- **Heatmap cell tooltip** lists the reasons for the colour.
- **`/parent/words/[wordId]`** is the explainability surface. It
  shows:
  - the Wilson lower bound on the bucket scale (with naive ratio for
    contrast),
  - rank against the deck and pick probability for the next round,
  - a **forecast** chart over the next 14 days — the recall curve and
    the projected pick probability, with the day where it crosses
    50% marked,
  - the priority queue with this word highlighted (so you can see
    what it is competing with),
  - the full priority breakdown (factor × value × weight ×
    contribution),
  - the attempt timeline (chronological dot strip + table),
  - and the raw `learner_word_state` for sanity checks.
- **`scripts/reset-practice.ts`** wipes attempts/rounds/sessions/state
  if the algorithm needs to be tested on a clean slate.

### How the projection chart is computed

`projectWord` (in `src/lib/learning/projection.ts`) holds the rest of
the deck still and walks the target word forward day-by-day. Each
day:

- `daysSinceSeen` increases by 1 → recall = `exp(−d/stability)` drops.
- `priorityScore` is recomputed (the dueScore factor rises while
  others stay roughly constant).
- The word is inserted into the sorted deck to find its projected
  rank.
- Rank → probability via a sigmoid centred at rank 8 (`1 / (1 +
  exp(0.4·(rank − 8)))`). So rank 1 ≈ 99%, rank 8 ≈ 85%, rank 12 ≈
  50%, rank 20 ≈ 10%.

The simplification: other words are not aged. In reality, every word
ages by the same calendar day, so relative orderings are mostly
stable. The chart is a planning aid, not a forecast — it shows "if
nothing else changes, when does this word re-enter the top 8?".
