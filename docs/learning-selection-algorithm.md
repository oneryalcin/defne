# Learning Selection Algorithm

Status: current V2.1 primer for the round word selector.

This document explains what Defne is solving and how the app decides which
words should appear in the next child mission. It is intended for product,
engineering, and mathematical review. It describes the algorithm, not just the
code.

Implementation entry points:

- Selector: `src/lib/learning/roundSelection.ts`
- Learning state persistence: `src/lib/db/repository.ts`
- Learner state schema: `db/migrations/0004_selection_v2_state.sql`

Older documents describe earlier queue and priority-score approaches. This
document is the current source of truth for V2.1 word selection.

## Product Problem

Defne is a local-first vocabulary practice app for a parent and one child. The
parent controls the vocabulary list. The child completes short missions that
teach and test word meaning and sentence use.

The selector answers one question:

```text
Which 6 to 12 words should the next mission practise?
```

The answer should maximize durable learning without creating a frustrating or
repetitive experience.

The selector must avoid these failure modes:

- Repeating the same recently missed word too many times.
- Letting mistake recovery dominate every mission.
- Starving new words because old weak words always look urgent.
- Treating forgotten words as normal review when they need relearning support.
- Letting stable or mastered words crowd out active learning.
- Treating answer reveals as evidence of successful recall.
- Letting parent edits keep old mastery evidence attached to changed content.

## Design Goal

The selector is a constrained utility scheduler:

```text
1. Compute a bounded learning-utility score for every word.
2. Sort words by utility plus tiny deterministic jitter.
3. Select the best words while obeying mission-shape caps.
4. Relax caps in a known fallback order only when needed to fill the mission.
5. Store reason labels so the parent can inspect why each word was selected.
```

This is not a claim of theoretical optimality. It is a transparent, tunable,
child-friendly scheduler based on expected learning value.

## Core Word State

Each learner-word state tracks evidence about the child's memory for that word.
The important scheduling fields are:

```text
attempt_count
correct_count
wrong_count

mastery_colour
stability_days

last_practiced_at
last_exposed_at
last_clean_retrieval_at
last_supported_success_at
last_wrong_at
last_revealed_at

last_practiced_session_id
last_practiced_interaction_index

recovery_debt
learner_state_content_version
words.content_version
```

Important timestamp distinction:

- `last_exposed_at`: the child saw the word or card.
- `last_practiced_at`: the word was part of a learning/practice interaction.
- `last_clean_retrieval_at`: first-attempt correct, no hint, no reveal.
- `last_supported_success_at`: correct after support, hint, retry, or scaffold.
- `last_wrong_at`: wrong answer.
- `last_revealed_at`: answer was revealed or moved on.

Only clean retrieval is strong evidence that the child can recall the word.
Exposure and reveal can help learning, but they are not retrieval success.

## Word Lifecycle Categories

The selector uses continuous scores, but it still needs a few lifecycle
definitions.

```text
Untouched:
  no exposure and no attempt

IntroducedOnly:
  exposed in a learn card or explanation
  no retrieval evidence yet

HasRetrievalEvidence:
  clean retrieval exists
  or supported success exists
  or wrong answer exists
  or reveal exists

ActiveRecovery:
  recovery_debt > 0
  and the latest wrong/reveal is within 14 days
```

Untouched and introduced-only words do not have a meaningful recall probability
yet. They are introduction candidates, not normal review items.

Old unresolved failure is not active recovery forever. After the active recovery
window, historical debt can still affect weakness or relearning, but it no
longer behaves like a fresh mistake loop.

## Predicted Recall

For words with retrieval evidence, the selector estimates current recall.

Clean retrieval uses the existing exponential decay model:

```text
R = exp(-days_since_last_clean_retrieval / stability_days)
```

With this formula, `stability_days` is the exponential time constant. It is not
the number of days until review is due and not the number of days until recall
falls to 90 percent.

When no clean retrieval exists, the selector uses decaying fallbacks:

```text
supported success:
  R = 0.65 * exp(-days_since_last_supported_success / 1.5)

wrong or reveal only:
  R = 0.45 * exp(-days_since_last_wrong_or_reveal / 1.5)
```

The result is clamped:

```text
0.05 <= R <= 0.95
```

Recent failure caps predicted recall even if an older clean retrieval exists:

```text
if last_wrong_at is after last_clean_retrieval_at:
  R = min(R, 0.65)

if last_revealed_at is after last_clean_retrieval_at:
  R = min(R, 0.50)
```

This prevents the model from claiming high recall immediately after failure.

## Target Recall

Different words have different target recall thresholds:

```text
red/orange/recovery words: 0.80
yellow/default words:     0.82
light_green words:        0.88
green words:              0.90
```

A child-facing mission should usually live in a high-success challenge zone,
not around 50 percent recall. Words below the useful retrieval range may need
relearning support instead of ordinary review.

## Score Components

Every candidate word receives bounded components.

### Recovery

Recovery brings back recent mistakes and reveals.

```text
active_recovery =
  recovery_debt > 0
  and days_since_latest_wrong_or_reveal <= 14

Recovery =
  active_recovery ? min(recovery_debt, 3) / 3 : 0
```

This makes fresh mistakes important without creating permanent queue
membership.

### Due

Due measures how far predicted recall has fallen below target recall.

```text
Due =
  if R >= R_target:
    0
  else:
    clamp(
      log(R_target / R) / log(R_target / 0.55),
      0,
      1
    )
```

The lower bound `0.55` is the relearning floor. Below that, the word is treated
as very-low-recall, not just increasingly overdue.

### Opportunity

Opportunity favors words near their useful challenge zone. It is only used when
the word is not very low recall.

```text
a = R_target / (1 - R_target)

Opportunity =
  normalized value of R^a * (1 - R)
  whose peak is at R_target
```

The implementation computes this with logs and clamps it to `0..1`.

### Weakness

Weakness is low confidence on already-seen words.

```text
Weakness = 1 - confidence_lower_bound
```

The confidence lower bound comes from the mastery scoring model.

Untouched and introduced-only words do not use weakness. They are selected by
introduction pressure, not by pretending that unknown confidence is failed
evidence.

### Novelty

Novelty gives untouched or introduced-only words a path into the mission.

```text
Novelty =
  0.6 + 0.4 * min(1, days_waiting / 7)
```

This prevents new-word starvation while keeping introductions capped.

### Proof

Proof gives a small bump to words close to a mastery threshold, when enough time
has passed and there is no active recovery.

```text
Proof = 1
  if the word is close to a confidence threshold
  and last_practiced_at is at least 1 day ago
  and Recovery == 0
```

This supports "almost secure" words without hard category queues.

### Cooldown

Cooldown suppresses recent repetition.

```text
K = 1 - exp(-hours_since_relevant_event / tau)
```

Relevant event and tau:

```text
untouched:
  K = 1

introduced_only:
  relevant_event = last_exposed_at
  tau = 2 hours

active_recovery:
  relevant_event = latest wrong/reveal/exposure/practice
  tau = 0.75 hours

ordinary retrieval word:
  relevant_event = last_practiced_at
  tau = 6 hours
```

Hard recent gates:

```text
ordinary word:
  ineligible if practiced within 2 hours, unless emergency backfill

introduced-only word:
  ineligible if exposed within 2 hours, unless emergency backfill

active recovery word:
  ineligible if practiced/revealed within 15 minutes,
  unless enough intervening interactions make it eligible
```

## Final Utility Formula

The current V2.1 utility is:

```text
base_utility =
    3.0 * Recovery
  + 1.4 * Due
  + 0.7 * Opportunity
  + 0.8 * Weakness
  + 0.7 * Novelty
  + 0.4 * Proof

hardness_multiplier =
  VeryLowRecall ? 0.35 : 1.0

utility =
  Cooldown * hardness_multiplier * base_utility
```

All components are bounded and finite. This is deliberate. No single raw signal
should explode and dominate the mission.

## Very-Low-Recall Words

A word is very low recall when:

```text
R < 0.55
```

Very-low-recall words are still candidates, but their utility is damped by the
hardness multiplier and they are capped. The reason label is "Needs relearning."

This distinction matters because a forgotten word may need scaffolded
relearning, not ordinary retrieval practice.

## Mission Caps

Caps protect mission shape even if raw scores are imperfect.

For target count `n`:

```text
stable_cap       = min(3, ceil(0.25 * n))
green_cap        = min(1, ceil(0.10 * n))
recovery_cap     = min(4, ceil(0.35 * n))
introduction_cap = min(3, ceil(0.25 * n))
very_hard_cap    = min(2, ceil(0.20 * n))
```

For a 12-word mission:

```text
stable/light-green-or-green: max 3
green/mastered:              max 1
active recovery:             max 4
untouched or introduced:     max 3
very low recall:             max 2
```

`introduction_cap` applies to both untouched and introduced-only words. This
prevents learn-card-only words from flooding the mission.

## Selection Passes

The selector greedily scans candidates sorted by utility, adding each word if
it is allowed under the current pass.

```text
passes = [
  strict_caps,
  relax_stable,
  relax_green_if_needed,
  relax_new,
  relax_recovery,
  relax_very_hard,
  emergency_too_recent
]
```

The current child mission is retrieval-first and does not yet have a separate
scaffolded relearning UI. For that reason, recovery is relaxed before very-hard
relearning.

If a future scaffolded relearning mode exists, the fallback order can safely
relax very-hard words before extra recovery.

The green cap is explicitly relaxable. This matters for small decks or all-green
decks, where the selector must still be able to fill a mission.

## Next-Round Intent

A parent or child "Next round" request is an assignment-layer policy, not a
change to the V2.1 selection math. The core selector in
`src/lib/learning/roundSelection.ts` still computes utility, caps, passes, and
reason labels from learner state exactly as described above.

For a per-child assignment, a parent can mark an active vocabulary word or
spelling item as `next_round_once`. A child can also mark one of their active
vocabulary words from the child word detail page. When the next mission is
created:

- vocabulary takes at most 3 requested words at the front of a 6-12 word
  mission;
- spelling takes at most 2 parent-marked items at the front of the spelling
  mission;
- those marked items are removed from the remaining candidate pool before the
  normal selector fills the rest of the mission;
- selected vocabulary words keep the existing reason code `parent_next_round`
  with neutral copy so the parent can inspect why they appeared;
- the assignment priority is consumed immediately after the mission is
  committed, so it is a one-time nudge;
- pausing an assignment clears any pending priority.

This deliberately does not mutate `learner_word_state`,
`spelling_learner_state`, mastery colour, stability, recovery debt, review
timestamps, or clean-retrieval evidence. The intent is to let a parent say
"please include this soon" or a child say "I want to practise this soon"
without pretending the child remembered, forgot, or changed mastery level.

## Tie-Breaking

Ties use deterministic jitter:

```text
jitter = hash(word_id + mission_date) / 1000
```

This creates variety while keeping the selector debuggable. Running the same
mission date against the same deck produces stable ordering.

## Reason Labels

Each selected word gets an inspectable reason:

```text
Needs mistake recovery
New word
Needs relearning
Stable check
Scheduled review
Almost secure
Useful practice
```

Primary reason order:

```text
if ActiveRecovery:
  Needs mistake recovery
else if Untouched or IntroducedOnly:
  New word
else if VeryLowRecall:
  Needs relearning
else if StableOrMastered and Due > 0:
  Stable check
else if Due >= 0.5:
  Scheduled review
else if Proof > 0:
  Almost secure
else:
  Useful practice
```

Reason labels should be parent-explainable, not mathematically exhaustive.

## Recovery Debt Lifecycle

Mistakes create recovery debt. Clean spaced retrieval reduces it.

Debt creation:

```text
answer revealed:
  recovery_debt = max(recovery_debt, 3)

wrong answer:
  recovery_debt = max(recovery_debt, 2)

correct after hint, support, or retry:
  last_supported_success_at = now
  recovery_debt = max(recovery_debt, 2)

clean first-attempt correct:
  last_clean_retrieval_at = now
  may reduce recovery_debt if proof spacing is eligible
```

Eligible proof is stage-gated:

```text
Debt 3 -> 2:
  same day allowed, but not immediate
  requires at least 15 minutes, a later session/day, or enough intervening interactions

Debt 2 -> 1:
  requires a later session or later calendar day

Debt 1 -> 0:
  requires a spaced success at least 2 days after the latest wrong/reveal
```

This preserves the "three clean follow-ups" idea while preventing three
immediate same-day successes from erasing a real failure.

## State Updates By Event

Clean first-attempt correct:

```text
counts as retrieval evidence
updates last_clean_retrieval_at
increases normal mastery state
may reduce recovery debt if spacing is eligible
```

Supported success:

```text
counts as partial evidence
updates last_supported_success_at
does not fully clear recovery debt
```

Wrong answer:

```text
updates last_wrong_at
sets recovery_debt to at least 2
updates normal mastery state as a miss
```

Answer revealed:

```text
updates last_revealed_at
sets recovery_debt to at least 3
counts as exposure/study
does not update last_clean_retrieval_at
```

Learn-card exposure:

```text
updates last_exposed_at
updates last_practiced_at
does not create retrieval evidence
```

Parent content edit:

```text
increments words.content_version
resets learner-word mastery and retrieval evidence
sets learner_state_content_version to the new content version
keeps historical attempts only as audit history
```

For this POC, parent edits are allowed to be breaking. Correct current learning
state matters more than preserving old aggregate evidence.

## Pseudocode

```text
function select_round_words(deck, now, target_count):
    n = clamp(round(target_count), 6, 12)
    caps = scaled_caps(n)

    candidates = []

    for word in deck:
        features = compute_features(word, now)
        utility = features.utility
        reason = reason_for_word(word, features)
        jitter = deterministic_jitter(word.id, date(now))

        candidates.append(word, features, utility, reason, jitter)

    sort candidates by:
        utility descending
        jitter descending

    selected = []

    for pass in selection_passes:
        for candidate in candidates:
            if len(selected) == n:
                break
            if candidate.word already selected:
                continue
            if not allowed_under_pass(candidate, selected, caps, pass):
                continue

            selected.append(candidate)

        if len(selected) == n:
            break

    return selected.word_ids and selected.reason_labels
```

## Worked Examples

### Revealed Word Yesterday

```text
last_revealed_at = yesterday
recovery_debt = 3
active_recovery = true
Recovery = 1
```

This word gets high utility and reason "Needs mistake recovery", but it is still
subject to the recovery cap and cooldown.

### Clean Green Word Seen Recently

```text
mastery_colour = green
last_practiced_at = 30 minutes ago
Recovery = 0
Due = 0
too_recent_ordinary = true
```

This word is blocked until emergency backfill. It should not crowd out active
learning.

### Untouched Word

```text
attempt_count = 0
last_exposed_at = null
R = null
Due = 0
Opportunity = 0
Weakness = 0
Novelty = 0.6 to 1.0
```

This word can enter through introduction pressure, capped with other
introduction candidates.

### Old Forgotten Word

```text
R < 0.55
VeryLowRecall = true
hardness_multiplier = 0.35
reason = Needs relearning
```

The word can appear, but the selector treats it as relearning and caps how many
such words can enter a normal mission.

## Invariants

Every selected mission should satisfy these properties:

```text
selected_count <= min(target_count, eligible_deck_size)
no duplicate word IDs
all utility values are finite
all selected words are eligible under the final pass used
untouched words do not have Due > 0
untouched words do not fake R = 0
revealed words do not update last_clean_retrieval_at
active recovery expires after the active recovery window
green cap can relax when otherwise impossible to fill
too-recent ordinary words appear only in emergency backfill
parent content edits reset current learner state for that word
```

These invariants are more important than exact coefficient values. Coefficients
can be tuned from pilot data; these rules protect the learning model.

## Pilot Metrics To Watch

To tune the selector, log or inspect:

```text
first-attempt accuracy by reason label
repeat selections within 24 hours
missions waited before a new word first appears
percentage of each mission from recovery words
percentage from introduction words
percentage from stable/mastered checks
revealed-answer recovery success rate
words blocked by caps
words blocked by cooldown
old selector rank vs V2.1 rank, if shadow mode is enabled
```

The most important calibration question:

```text
When predicted recall is around 0.8, is actual first-attempt accuracy near 80%?
```

If not, tune stability updates and fallback recall estimates before changing the
selector shape.

## Summary

Defne selects the next mission words by bounded expected learning value, then
constrains the result so the mission stays varied and humane.

In one sentence:

```text
Pick the words with the highest useful learning value now, while preventing
recent mistakes, new introductions, very-hard relearning, and mastered checks
from overwhelming the child mission.
```
