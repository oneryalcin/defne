# Mastery Scoring And Session Selection

## Purpose

This document defines how the app should decide which vocabulary words to practise in each session.

The visible session structure can stay simple, such as:

- 5 new or red words.
- 10 review words.
- 5 almost-mastered words.
- A few older green words for maintenance.

That is only the session shape. The underlying selection should be decay-based and priority-scored, not a simple fixed rotation.

## Core Idea

Every word should become due for practice based on:

- How weak it is.
- How recently it was practised.
- Whether it was answered correctly.
- Whether hints were needed.
- Whether the child was slow or uncertain.
- Whether spelling, meaning, or usage is the weak dimension.
- Whether the word is close to mastery and needs proof across time.

This is similar in spirit to search ranking or Elasticsearch-style decay scoring: old, weak, recently failed, or unstable items rise in priority; stable items fade down until they are due again.

## Separate Mastery Dimensions

Vocabulary mastery is not one score. A child may know the meaning but still misspell the word, or recognise the word in multiple choice but fail to produce it.

Track at least three dimensions per word:

- `meaning_mastery`: understands the definition and broad meaning.
- `usage_mastery`: understands the word in sentence context.
- `spelling_mastery`: can produce the spelling accurately.

Example:

```text
word: reluctant
meaning_mastery: 0.85
usage_mastery:   0.65
spelling_mastery: 0.40
```

This word should not be green yet. The child may understand `reluctant`, but spelling and usage still need work.

## Suggested Word State

Each learner-word record should track:

```text
word_id
learner_id

meaning_mastery: 0.0 - 1.0
usage_mastery:   0.0 - 1.0
spelling_mastery: 0.0 - 1.0

last_seen_at
last_correct_at
last_wrong_at

stability_days
attempt_count
correct_count
wrong_count

last_hint_level_used
average_hint_level_used
average_response_time_ms

failure_types
confused_with_word_ids

mastery_colour
```

`stability_days` is the current estimate of how long the word can stay remembered before recall starts to decay.

## Recall Decay

Use a simple exponential decay model for the MVP:

```text
recall_probability = exp(-days_since_seen / stability_days)
```

Interpretation:

- High-stability words decay slowly.
- Low-stability words decay quickly.
- A word answered correctly only once should have low stability.
- A word recalled correctly across several days should have higher stability.

Example:

```text
days_since_seen = 3
stability_days = 6
recall_probability = exp(-3 / 6) = 0.61
```

That word is starting to become due.

## Priority Score

The app should calculate a practice priority score for each word.

Suggested MVP formula:

```text
priority =
  due_score
  + weakness_score
  + recent_failure_bonus
  + spelling_trap_bonus
  + almost_mastered_bonus
  + delayed_recall_bonus
  - too_recent_penalty
```

Where:

```text
due_score = 1 - recall_probability

weakness_score =
  1 - min(meaning_mastery, usage_mastery, spelling_mastery)
```

The use of `min(...)` is deliberate. A word should not look strong if one major dimension is weak.

## Bonuses And Penalties

`recent_failure_bonus`

Increase priority if the child recently missed the word, especially if it was missed without hints.

`spelling_trap_bonus`

Increase priority if the word has repeated spelling mistakes or known tricky parts, such as double letters.

`almost_mastered_bonus`

Increase priority for words around `0.75 - 0.90` mastery. These words are close to green but need delayed proof.

`delayed_recall_bonus`

Increase priority when the word is at an important recall checkpoint, such as next day, three days later, or a week later.

`too_recent_penalty`

Reduce priority if the word was just practised a few minutes ago, unless the session is intentionally doing immediate correction.

## Session Quotas

After scoring all candidate words, select from pools.

Suggested pools:

```text
new_or_red_pool:
  words with no history, very low mastery, or red state

review_pool:
  words whose recall probability has decayed below the review threshold

almost_mastered_pool:
  words around 0.75 - 0.90 mastery that need proof across time

maintenance_pool:
  green words due for occasional checks
```

Suggested default session:

```text
5 new_or_red
10 review
5 almost_mastered
0-3 maintenance
```

The exact counts can be adjusted by session length. The important rule is that the user experience remains predictable while the underlying word selection is adaptive.

## Updating Mastery After An Attempt

A correct answer should not always increase mastery equally.

Factors that affect the update:

- Question type.
- Whether the answer was unassisted.
- Hint level used.
- Response time.
- Whether it was multiple-choice or produced from memory.
- Whether the word was recalled after a delay.

Example scoring weights:

```text
unassisted correct production: strong increase
unassisted correct multiple choice: medium increase
correct after small hint: small increase
correct after heavy hint: very small increase
wrong after hint: decrease
wrong without hint: stronger decrease
```

Delayed recall should count more than immediate repetition.

## Updating Stability

Stability should increase when the child recalls a word correctly after a meaningful delay.

Simple MVP rules:

```text
if correct and days_since_seen >= 1:
  stability_days = stability_days * 1.4

if correct and days_since_seen < 1:
  stability_days = stability_days * 1.1

if wrong:
  stability_days = max(1, stability_days * 0.5)
```

These multipliers are starting values only. They should be tuned from real use.

## Colour Mapping

The mastery colour should derive from the weakest dimension and recall stability.

Suggested mapping:

```text
weakest_mastery = min(meaning_mastery, usage_mastery, spelling_mastery)

red:
  weakest_mastery < 0.35

orange:
  0.35 <= weakest_mastery < 0.60

yellow:
  0.60 <= weakest_mastery < 0.78

light_green:
  0.78 <= weakest_mastery < 0.90

green:
  weakest_mastery >= 0.90
  and recall has been proven across multiple days
  and spelling_mastery is not weak
```

Green should require time-based evidence, not just high in-session accuracy.

## Exercise Selection

The weak dimension should decide the next exercise type.

Examples:

```text
low meaning_mastery:
  ask definition, synonym, antonym, and simple context questions

low usage_mastery:
  ask sentence-fit, sentence-choice, and confusable-word questions

low spelling_mastery:
  ask type-from-memory, missing-letter, and spelling-error questions
```

If the word is nearly mastered, prefer harder production and delayed recall tasks.

## Avoiding Bad Loops

The algorithm should avoid these behaviours:

- Asking the same word too many times in a row.
- Letting multiple-choice success hide weak spelling.
- Marking a word green after one strong session.
- Punishing a child too heavily for one mistake on an otherwise stable word.
- Introducing too many new red words at once.
- Using AI-generated hints as if they were proof of mastery.

## MVP Recommendation

Start with a simple deterministic scoring engine:

1. Track separate meaning, usage, and spelling mastery.
2. Track last seen, last correct, last wrong, and stability days.
3. Use exponential recall decay.
4. Score words into session pools.
5. Select a predictable batch from the highest-priority words in each pool.
6. Update mastery based on correctness, hint level, question type, and delay.

This is sophisticated enough for useful learning, but simple enough to test and explain.

Later, the app can replace the scoring engine with a more advanced spaced-repetition model without changing the product experience.
