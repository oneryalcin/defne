# Round-Based Vocabulary Mode

## Purpose

This document defines a focused vocabulary round mode for learning a small batch
of words deeply before they enter the broader spaced-review scheduler.

The loop is:

```text
Learn cards -> recognise meaning -> use in context -> update mastery -> schedule review
```

This mode should feel like a short mission, not a generic test. The child is
allowed to recover from mistakes inside the round, but the engine must still
remember first-attempt mistakes for future scheduling.

## Round Shape

A round contains `N` selected words. The starting value should be small enough
for attention and memory:

```text
recommended N: 12 words for the pilot
minimum N: 6 words for tests or deliberately short sessions
```

Each round has three steps.

The default 12-word queue is split into 9 regular scheduler slots plus 3
comeback slots. Comeback slots first reserve up to 1 mastered (`green`) word
whose last test was at least 5 days ago, then fill the remaining comeback slots
with stable (`light_green`) words whose last test was at least 24 hours ago. If
no stable or mastered words satisfy those spacing filters, the slots fall back
to the normal scheduler.

## Step 1: Learn Cards

Show one card per word.

Each card should include:

- Word.
- Child-friendly definition.
- One or two context sentences.
- Synonyms or near-synonyms.
- Antonyms or contrasts where available.
- Spelling note if relevant.
- Confusable word if relevant.

The child can move back and forth freely.

Progression rule:

- Each card must be viewed at least twice before Step 2 is unlocked.
- On the second view, the card should encourage active recall before revealing
  the full support content.

The second view should not be a duplicate of the first view. Use this pattern:

```text
first view:
  show word, definition, example, synonyms/antonyms, spelling note, confusable

second view:
  show word + a blanked or partially hidden sentence
  ask the child to think of the meaning before revealing support
  reveal the definition/example only after an explicit action
```

The second rule matters because passive exposure is weaker than retrieval. The
app does not need to score this in MVP, but the UI should avoid making Step 1 a
pure reading task.

## Step 2: Meaning Recognition

Show one word from the round and four definition choices.

The child chooses the matching definition.

Retry rule:

- Ask every word once.
- At the end of the pass, repeat only the words answered incorrectly.
- Continue until all words have been matched correctly at least once.
- If a word is still missed after 3 retry passes, reveal the canonical answer
  with a short explanation, mark the word as struggled, and move on. The word
  should stay high-priority for near review rather than blocking the round.

Important scoring rule:

```text
first_attempt_correct is the mastery signal.
eventually_correct is only the round-completion signal.
```

Example:

If the child answers 6 of 10 correctly on the first pass, the next pass contains
only the 4 missed words. When all 10 are eventually correct, Step 3 unlocks.
However, the 4 missed words still carry mistake evidence.

## Step 3: Context Usage

Show a sentence with a gap and four word choices from the round or nearby
distractors.

The child chooses the word that best completes the sentence.

Retry rule:

- Ask every sentence once.
- At the end of the pass, repeat only the sentences answered incorrectly.
- Continue until every sentence has been filled correctly at least once.
- If a word is still missed after 3 retry passes, reveal the canonical answer
  with a short explanation, mark the word as struggled, and move on. The word
  should stay high-priority for near review rather than blocking the round.

Again:

```text
first_attempt_correct is the mastery signal.
eventually_correct is only the round-completion signal.
```

Step 3 updates `usage_mastery` more strongly than Step 2 because it tests meaning
inside context rather than direct definition recognition.

## Distractor Quality

Multiple-choice distractors should be meaningful, not random.

Prefer distractors from:

- Other words in the same round.
- Synonyms with subtly different meaning.
- Antonyms where confusion is plausible.
- Confusable words.
- Words from the same semantic topic.
- Words previously confused by this learner.

Avoid distractors that make the answer obvious by length, part of speech, or
topic mismatch.

## Mistake Counting

For Step 2 and Step 3, mistakes have equal base weight.

Record at least:

```text
practice_round_id
word_id
step: meaning_recognition | context_usage
pass_number
attempt_number_for_word_in_step
first_attempt_correct
eventually_correct
submitted_answer
expected_answer
mistake_count_for_step
created_at
```

The same word may be eventually correct inside the round and still receive a
recent-failure bonus in future selection.

## Round Persistence

Round mode needs its own parent record so retry passes, graduation, and parent
summaries have a stable anchor.

Store at least:

```text
practice_rounds:
  id
  learner_id
  session_id
  status: in_progress | completed | abandoned
  current_step: learn_cards | meaning_recognition | context_usage | spelling_production
  max_retry_passes
  word_ids_json
  card_view_counts_json
  started_at
  ended_at
  summary_json
  created_at
  updated_at
```

Round attempts can either extend `practice_attempts` with nullable round fields
or use a dedicated child table. The important requirement is that each scored
attempt can be traced back to round, step, pass number, and first-attempt versus
eventual correctness.

## Recent Mistake Decay

The scheduler should treat recent mistakes as strong evidence and older mistakes
as weaker evidence.

Suggested MVP formula:

```text
mistake_recency_weight = exp(-hours_since_mistake / mistake_half_life_hours)
```

Start with:

```text
mistake_half_life_hours = 24
```

Interpretation:

- A mistake from a few minutes ago matters heavily.
- A mistake from yesterday still matters.
- A mistake from last week matters only if the pattern repeated.

This should feed into the existing priority score as `recent_failure_bonus`.
Round mistakes use this formula as the source of `recent_failure_bonus`; do not
implement a second independent round-mistake bonus.

## Graduation From Current Round

A word should leave the active retry loop only when it is eventually answered
correctly in the current step.

A word should count as genuinely strengthened only when:

- Step 2 was first-attempt correct.
- Step 3 was first-attempt correct.
- No mistake was recorded for that word in the latest mini-cycle.
- The answer was not extremely slow, if response time is being tracked.

This keeps the experience forgiving while keeping the mastery model honest.

## Re-Adding Words During Play

Words with fresh mistakes should be eligible to reappear soon, but not in a way
that feels punitive.

Suggested rule:

```text
If a word has any mistake in the current round:
  keep it in the retry pool until eventually correct.
  set near_review=true for a later mini-check.

If a word has zero mistakes across the last X eligible questions:
  clear near_review.
```

`X` is intentionally tunable. Start with:

```text
X = 3 eligible questions
```

An eligible question is one where the word could plausibly have appeared again
after enough spacing. Do not re-ask the same word immediately unless the current
step is explicitly in retry mode.

`near_review` is a scheduling flag, not a fifth long-lived mastery colour. While
the flag is true, the word may override its natural pool so it can appear in the
next suitable mini-check. Once the spacing rule above is satisfied, the normal
decay-based scheduler owns it again.

## Round 2 And Later Rounds

Later rounds repeat the same structure but use adaptive word selection.

Balance each new round across:

- New or red words.
- Recently missed words.
- Words that were eventually correct but not first-attempt correct.
- Words due by recall decay.
- Nearly mastered words that need proof across time.

Do not simply repeat all words from the previous round. The scheduler should
select based on current word state.

## Relationship To Mastery Dimensions

Step 2 primarily updates:

```text
meaning_mastery
```

Step 3 primarily updates:

```text
usage_mastery
```

Spelling is not directly tested by this mode unless a later step adds typed
production. If the app later adds Step 4, it should test:

```text
type the word from memory
```

and update:

```text
spelling_mastery
```

A word cannot become green from Step 2 and Step 3 alone if spelling is weak.

Until Step 4 exists, round completion must not imply spelling security. The
parent dashboard should be able to show: "completed the round, but spelling is
still weak" so effort and mastery do not look contradictory.

## MVP Acceptance Checks

Round-based mode is implemented correctly when:

- A round can be created with 12 words by default.
- Step 1 blocks progression until every card has been viewed at least twice.
- Step 2 repeats only first-pass misses until all are eventually correct.
- Step 3 repeats only first-pass misses until all are eventually correct.
- Step 2 and Step 3 reveal-and-move-on after 3 failed retry passes instead of
  trapping the child in an indefinite loop.
- First-attempt correctness and eventual correctness are stored separately.
- Mistake counts from Step 2 and Step 3 have equal base weight.
- Recent mistakes increase future word priority.
- A word can complete the round while still being scheduled for near review.
- The parent dashboard can show words that were eventually correct but not
  first-attempt secure.
- The parent dashboard can show words that completed a round while spelling
  remains weak.
