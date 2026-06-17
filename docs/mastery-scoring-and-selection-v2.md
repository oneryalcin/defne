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

The replacement is built on four ideas:

- **Wilson lower bound, not naive ratio.** 1/1 isn't the same evidence
  as 5/5 — even though both have a mean of 1.0. The 80% one-sided
  Wilson score interval gives `wilson(1, 1) ≈ 0.59`, `wilson(1, 5) ≈
  0.85`. That's the number we bucket on.
- **Earned status is separate from recall risk.** Colour is based on
  raw earned answer evidence. Time passing can make a word due for a
  refresh, but it does not demote the child-visible colour.
- **Recency-weighted confidence is scheduler/debug only.** Each
  correct/wrong is multiplied by `0.5^(age_days / 7)` to estimate how
  fresh the evidence is. This can raise review priority; it does not
  drive the earned colour.
- **Recent-wrong knockdown.** Independent of the math: a wrong answer
  inside the last 36 hours forces the colour down one bucket. Even if
  the lower bound still puts a word in `light_green`, a fresh failure
  means the kid needs that word back tomorrow, not "occasional refresh."

## The pipeline

```
attempts          ─┐
   │               │
   ▼               ▼
raw correct/wrong     recency-weighted correct/wrong
   │                         │
   ▼                         ▼
earned Wilson lower     current Wilson lower + recall estimate
   │                         │
   ▼                         ▼
bucket + mastery gates     scheduler priority / debug copy
   │
   ▼
recent-wrong knockdown ──→ earned colour
```

### Inputs read from `LearnerWordState` and `practice_attempts`

| Input | Source | Role |
|---|---|---|
| Per-attempt `(answeredAt, isCorrect, hintLevelUsed)` | `practice_attempts` rows | Drives current confidence / refresh explanations |
| `attemptCount`, `correctCount`, `wrongCount` | `learner_word_state` | Drives earned Wilson confidence |
| `averageHintLevelUsed` | `learner_word_state` | Disables the Reliable gate when > 0.5 |
| `lastSeenAt`, `stabilityDays` | `learner_word_state` | Recall estimate and selection priority |
| `lastWrongAt` | `learner_word_state` | Used by selection priority for the `recent-failure` bonus |

### The Reliable / Mastered gates

The Wilson bound alone is not enough — the spec is "two clean firsts →
Reliable; strong earned evidence across enough spacing → Mastered." So:

- **`firstAttemptsClean(state)`** = `attemptCount ≥ 2 AND correctCount ≥
  2 AND wrongCount === 0 AND averageHintLevelUsed ≤ 0.5`. When this is
  true, the colour is *at least* Reliable (`light_green`).
- **Mastered (`green`)** further requires `lowerBound ≥ 0.80`,
  enough stability, `correctCount ≥ 4`, low hint dependency, and no
  unresolved mistake recovery. Required stability starts at 7 days for
  sparse evidence and falls toward 3 days as clean evidence accumulates.
  Example: 4/4 in one burst is Reliable; 12/12 clean across several
  days is Mastered even if the word is now due for a refresh.

### Bucket thresholds

| Earned Wilson lower bound | Colour | Label |
|---|---|---|
| `< 0.30` | `red` | Needs work |
| `< 0.55` | `orange` | Building |
| `< 0.70` | `yellow` | Nearly steady |
| `≥ 0.70` AND not clean firsts | `light_green` | Reliable (capped — never Mastered without clean firsts) |
| (clean firsts) | `light_green` (Reliable floor) | Reliable |
| (clean firsts) AND `≥ 0.80` AND enough stability AND `correctCount ≥ 4` | `green` | Mastered |

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
- `confidence-gap`: `1 − currentLowerBound`. Words whose fresh evidence
  is weak get more practice without changing earned colour.
- `recent-failure`: bonus when `lastWrongAt` is fresh (decays over hours).
- `almost-mastered`: small bump when the lower bound is in
  `[0.55, 0.70)` so words on the edge get one more clean proof.
- `delayed-recall`: bump when ≥ 1 day has passed and recall has
  dropped below 0.72 — getting it now is stronger evidence than getting
  it back-to-back.
- `too-recent-penalty`: subtract when the word was seen in the last 12
  minutes and not missed. Avoids back-to-back asks of the same word.

For untouched words: a flat `0.4` so they're picked only when nothing
needier sits in the queue. For mastered (`green`) words: scheduler
priority is deliberately tiny and parent bucket caps decide whether any
stable/mastered refresh belongs in the round at all.

## Why this is good enough (and where it isn't)

Good enough:

- **Honest about uncertainty.** 1/1 ≠ 5/5 ≠ 1/2. The Wilson interval is
  the right small-sample tool.
- **Forgetting is real, but not demoralising.** The 7-day half-life
  captures refresh need without erasing achievement.
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
  by × 1.4 on clean correct. Keep checking this against real learner
  histories so Mastered means durable learning without wasting attempts.

## Where the code lives

- `src/lib/learning/scoring.ts` — `scoreFromState`,
  `priorityBreakdownForState`. Pure; no DB.
- `src/lib/learning/mastery.ts` — `masteryColourForState`,
  `priorityScore` delegate to scoring.
- `src/lib/db/repository.ts` — `getParentWords`, `getMissionPreview`,
  `getWordDetail` fetch attempts and pass them in.

## Selection — twelve slots, fifty-three contenders

The round selector fills **9 regular priority slots plus 3 comeback
slots** from the deck. That does most of the work in answering "when
will I see this word again?":

- A word ranked 1–9 by regular priority will surface in the next round.
- Up to 3 extra comeback slots are reserved for due Reliable/Mastered
  words before falling back to the regular priority queue.
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

`projectWord` (in `src/lib/learning/projection.ts`) walks the *entire*
deck forward day-by-day, then asks "where does this one rank?" at
each step. Each day:

- Every word's `daysSinceSeen` increases by `d` → recall =
  `exp(−d/stability)` drops on each.
- Every word's `priorityScore` is recomputed.
- The target word is ranked against the rescored deck.
- Rank → probability via a sigmoid centred at rank 12 (`1 / (1 +
  exp(0.4·(rank − 12)))`). So rank 1 ≈ 99%, rank 12 ≈ 50%, rank 20 ≈
  10%.

Why age the whole deck? Without it, the chart is a lie: the target
word's dueScore rises but everyone else's looks frozen, so a Reliable
word that just got a clean correct appears to jump to ~95% pick
chance overnight. In reality, every word's curve is rising at the
same rate, so relative ranks are mostly stable until one word's
recall drops below another's.

The simplification still left in: we assume nobody gets practised
during the projection window. In practice the learner *will* practise
some words each day, which would suppress those words' rank and let
others (including this one) rise sooner. Treat the chart as a
"if nothing else moves" planning aid, not a calendar.
