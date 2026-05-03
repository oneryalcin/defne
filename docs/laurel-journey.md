# Laurel Journey

> The reward system for the Defne pilot. A long, calm story of a laurel tree
> growing across roughly 50 stages and 500 words. The tree responds to genuine
> learning evidence, never to session attendance, streaks, or coin-grinding.
>
> If this document and the learning docs ever disagree, the learning docs win.
> See [`mvp-scope.md`](mvp-scope.md),
> [`mastery-scoring-and-session-selection.md`](mastery-scoring-and-session-selection.md),
> [`round-based-vocabulary-mode.md`](round-based-vocabulary-mode.md),
> [`vocabulary-learning-app-guidelines.md`](vocabulary-learning-app-guidelines.md).

## Purpose

Children respond to visible progress. Most apps deliver this with coins, streaks,
and confetti — exactly the patterns this product bans because they pull
attention away from learning and convert practice into reward-chasing.

The Laurel Journey is the project's answer to the same human need, framed
honestly: vocabulary mastery is itself a slow growth, and the visible reward is
a slow-growing thing. Defne is a Turkish name meaning "laurel tree" (bay
laurel — symbol of growth, learning, and quiet achievement). The pilot story
shows a single laurel tree growing across the child's vocabulary journey, from
a seed on a kitchen windowsill to a mature tree the child can sit under.

The reward layer must satisfy three contracts. If any one breaks, the system
becomes a coin shower in disguise.

## The Pedagogical Contract

These three rules are non-negotiable.

### 1. Growth tracks learning evidence, not effort

Stage advancement is gated by **mastery movement**, not session count, time
spent, or attempts made. A child who clicks Start every day for thirty days but
never strengthens a word should not see the tree grow.

Triggering events come from the existing learning model:

- A word reaches Light Green (Reliable).
- A word reaches Green (Mastered, with multi-day stability proven).
- A spelling trap is fixed (typed first-attempt correctly after a previous miss).
- A round is completed with all words first-attempt correct.
- A previously forgotten-after-delay word is re-mastered.

Effort signals (sessions started, questions answered, hints used) feed
**parent-visible reflection copy**, never tree growth.

### 2. Stages can stall, but the tree never regresses

A Year 5 child who has a bad week, takes a break, or runs into a hard set of
words must not see the tree wilt, leaves drop, or a streak break.

The tree pauses. It never goes backwards.

This is doctrinally different from streak mechanics. The honest message is:
*your tree is the same size today as it was last week, because no new word
became reliable* — not "you lost progress because you missed a day."

A word that decays from green back to yellow does not reduce the tree's
stage. It may quietly become eligible to re-trigger growth on its next
re-mastery, which keeps the engine honest without punishing the child visually.

### 3. The reward is silent when pedagogy is failing

If scheduler evidence is thin — for example, many words only have supported
successes or recent reveals — the tree should not advance meaningfully even if
the child spent time in the app. Otherwise the reward lies to the child and
the parent dashboard loses trust.

Concretely: the growth-points budget for a stage requires evidence across
retrieval quality over time, not single-session bursts. A child who only ever
gets scaffolded practice can make progress, but should not push the tree
through full stages without clean recall evidence.

## Growth Points (The Hidden Unit)

Stage advancement uses an internal, invisible currency. The child never sees
a number; the database stores the accounting; stages cross thresholds when
the right evidence accumulates.

Why hidden: a visible "47 / 52 to next stage" number turns the tree into a
progress bar, which turns vocabulary practice back into XP grinding. Defeats
the entire intent.

### Suggested point schedule

These are starting values, to be tuned from real pilot data.

| Learning event | Points |
|---|---|
| Word reaches Light Green (Reliable) | 1 |
| Word reaches Green (Mastered, stability proven across multiple days) | 3 |
| Spelling trap fixed (first-attempt typed correctly after prior miss) | 1 |
| Round completed with all words first-attempt correct | 2 |
| Previously forgotten-after-delay word re-mastered | 2 |

500 words across 50 stages averages ~12–15 growth points per stage with this
schedule, depending on how often each event fires per word. Tuning happens by
adjusting stage thresholds, not the point values, so the underlying signal stays
honest.

### What does NOT earn points

- Starting a session.
- Completing a session.
- Answering correctly with heavy hints.
- Eventually-correct after multiple round attempts (use `first_attempt_correct`,
  not `eventually_correct`).
- Daily logins, streaks, time spent, questions answered.

If an event isn't strong evidence of durable learning, it isn't a growth event.

## Three-Act Story Shape

A flat 50-stage ramp is monotone. Children respond to chapter-shaped stories.
The pilot uses three acts. Stage counts inside each act are starting values
and can be tuned; the shape matters more than the exact numbers.

### Act I — Seed and Seedling (≈stages 1–12)

Defne plants a laurel seed in a small terracotta pot on a kitchen windowsill.
Quick visible progress, designed to hook the early learning loop and reward
the first few weeks of practice.

Visible beats include: seed, first sprout, two leaves, first true leaves,
repotting, moving outside.

Each act ends with one small calm illustrated cutscene-style page — never a
popup, never a celebration explosion. A two-line caption such as *"The
seedling is strong now. It's ready to move outside."*

### Act II — The Young Tree (≈stages 13–35)

The tree moves to a corner of a garden. Slower visible changes per stage (a
new branch, a thicker trunk, the first season turning, a small windbreak set
up after a cold week). This is the longest act and corresponds to the
pilot's bulk of word learning.

Care actions appear in this act (see next section). They are surfaced to the
child as observations of what already happened, not as chores to perform.

### Act III — The Full Tree (≈stages 36–50)

The laurel reaches maturity. New events: birds nesting, the first laurel leaf
the child can metaphorically pick (given to a teacher, to the parent, or kept
in a notebook — story choice to be decided), a small bench appearing under
the tree.

The arc closes with Defne sitting under her own tree, reading. This frames
vocabulary as something that grows into a place she can rest, not a hill she
is still climbing.

### Why the shape matters

Year 5 is a long attention window for a single arc, and many children will
not reach Act III in the pilot. The arc must remain rewarding even if the
child stops at stage 6 or stage 22. **Every stage must be a complete picture
in its own right**, not a placeholder for the next one. A windowsill seedling
in a small clay pot is its own image, not "step 6 of 50".

This is harder than it sounds. It's also the difference between a story and
a level meter.

## Care Actions (Bidirectional Metaphor)

The tree responds to the child's learning behaviour. Each care action is the
visual surfacing of a real learning event, not an arbitrary tap target.

| Care action (visual) | Triggering learning event |
|---|---|
| Watering | Revisiting a word before it decays (engine's `delayed_recall_bonus` fires for a word the child gets right). |
| Pruning | Correcting a recurring spelling trap (engine's `spelling_trap_bonus` resolves for a word). |
| Shielding from frost | Recovering a forgotten-after-delay word. |
| Feeding (compost) | First-attempt-correct on a previously missed word. |
| Reading aloud to it | Sentence-context production — the hardest exercise type — answered correctly. |

Care actions are **never tasks the child is asked to perform manually.** No
"tap to water" buttons. No daily watering reminders. The action happened
because the child did the learning; the visual is observation after the fact.

Surfacing in copy:

- *"You watered your tree this evening when you remembered `cautious`."*
- *"A frost was coming and you brought `reluctant` back inside in time."*
- *"You read to your tree today — the new sentence about `peculiar` was right."*

This makes the same metaphors usable on the parent dashboard without being
twee:

- *"Defne watered `cautious` today. It was due for review and she got it right."*
- *"A spelling trap on `separate` was pruned — three slips in a week, then
  first-attempt correct tonight."*

The risk to avoid: if the child can manually water the tree, the metaphor
inverts and the tree becomes a Tamagotchi. Keep care actions strictly as
*automatic consequences of learning events*, not chores.

## Visual Language

The existing palette and pencil-and-watercolour direction in
[`design-system.md`](design-system.md) already fits this layer. Specific
constraints for the journey:

- **The tree is rendered in the same style as the avatar.** Graphite line
  with light watercolour wash, warm paper canvas. Never photoreal, never
  cartoon mascot, never glowing.
- **Seasons matter more than stages.** A 50-stage arc that shows real seasons
  turning (spring buds, summer fullness, autumn yellow on a few leaves,
  winter sleeping) is calmer and more truthful than 50 distinct shapes. Many
  stages can share a base illustration with seasonal washes overlaid.
- **No glow, no sparkle, no halo, no particle effects.** The growth itself
  is the reward. A new branch this week. A bird's nest in Act III. A leaf to
  pick near the end.
- **The tree lives on its own page.** A new `/child/garden` route shows a
  single illustrated tree, the current stage's caption, and a small
  unobtrusive "what's next" hint phrased as anticipation, not a quest.
- **No permanent HUD on practice screens.** The tree never appears as a
  progress bar in the corner of the active practice page. That turns the
  tree into XP-meter chrome and breaks the calm contract that makes the
  practice surface focused.
- **No numeric XP visible to the child.** Growth points exist in the database
  for honest accounting; they never show as "47 / 52 to next stage."
- **Cutscene pages between acts are calm.** A single illustrated page, two
  lines of caption, a single "Continue to your garden" link. Not a modal,
  not blocking, dismissible.
- **The garden page can carry one tasteful laurel-leaf flourish** consistent
  with the rule already in `design-system.md` §10. Not on the tree itself
  (that would be redundant); perhaps as a small page-corner watermark.

## What We Will Not Do

This list is as important as the rest of the document.

- No coins, no XP numbers, no level numbers visible to the child.
- No streaks, daily-login bonuses, or "don't break your chain" pressure.
- No leaderboards, no peer comparison, no friend invites.
- No sibling/multiplayer side-by-side trees. Each child's tree is private.
  If the app ever supports multiple children, **never** show their gardens
  ranked.
- No mini-games on the garden screen. The garden has nothing to tap. A child
  who would rather look at the garden than do words today is allowed; the
  garden is a place to rest, not another thing to win.
- No timed events, no "limited-time" stages, no fear-of-missing-out.
- No regression: the tree never wilts, leaves never drop in punishment,
  branches never break.
- No celebratory full-screen confetti at stage transitions. Cutscene pages
  are calm, illustrated, and dismissible.
- No notifications nudging the child to come water their tree. The child
  comes back for words; the tree responds to that. Reversing the direction
  poisons the metaphor.
- No badges, no achievements list, no "you unlocked X" toasts.
- No gating of learning content behind progression. Every word is available
  for practice from day one regardless of stage.
- No premium / paid stages. (Trivially obvious in a family pilot, but worth
  recording for the future.)

## Architecture Sketch

This section is the engineer's contract surface, not implementation.

### Data

A new `learner_journey_state` table tracks per-learner journey state.
Suggested fields:

```text
learner_id           (FK)
scenario             ('laurel' for the pilot — string for future scenarios)
current_stage        (integer, 1..50)
growth_points        (integer, monotonically non-decreasing within a scenario)
last_advanced_at     (ISO timestamp)
last_cutscene_seen   (integer, last act-end cutscene the child has seen)
last_care_event_id   (FK, optional — for "you watered your tree today" copy)
created_at, updated_at
```

A `journey_events` log lets the parent dashboard surface honest reasons for
growth:

```text
id
learner_id
scenario
event_type           (one of the learning events above)
related_word_id      (optional)
points_awarded       (integer)
care_action          (optional, one of the five visual actions)
copy_seed            (deterministic string used to render parent-visible copy)
created_at
```

### Code

A new module `src/lib/learning/journey.ts` is a **pure function** from
learning events to growth points. One-way dependency only:

```text
journey reads from   learner_word_state, practice_attempts, practice_rounds
journey writes to    learner_journey_state, journey_events
journey never writes to mastery, scheduling, or canonical content tables
```

This keeps the reward layer cleanly separable. If the journey scenario is
ever swapped (different tree, different garden, different art set), nothing
in the learning engine changes.

### Routes

- `/child/garden` — the tree view. One illustrated tree, current caption,
  short "what's next" hint, no controls, no taps.
- Cutscene pages between acts — `/child/garden/cutscene/[actId]` or similar.
  Single illustration, two-line caption, one "Continue" link.
- A small parent-dashboard tile mirrors the tree state, with the latest
  honest reason for growth from `journey_events`.

### Future scenarios

The pilot ships with one scenario only — the laurel. The architecture must
treat scenarios as **slot-in story packs**: a scenario is a JSON file plus
a folder of stage illustrations plus a copy table. The growth-points engine
is universal.

Children should not be able to switch scenarios mid-journey on a whim;
mid-journey switches reset the visible tree but not the underlying mastery,
which is a confusing UX. A scenario is chosen once per learner, by the
parent, and is durable.

## Stage Definition (Deferred)

This document does not pin all 50 stages. The act shape is the contract; the
exact stage list comes later in collaboration with whoever produces the
illustrations, working from five reference frames:

1. Stage 1 — the seed, just planted.
2. Stage 12 — the windowsill seedling, first true leaves, end of Act I.
3. Stage 25 — the young tree in summer, mid Act II.
4. Stage 38 — the full tree with a bird's nest visible, Act III.
5. Stage 50 — Defne reading under her own tree.

If these five feel right, the 45 in between are interpolation: seasonal
washes, branch additions, the slow widening of the trunk. If any of the
five feels hyped or saccharine, the whole arc is wrong and the design
restarts before any code or schema is written.

## Open Questions

These are flagged for product/parent decision before implementation:

1. **What does the child do with the first laurel leaf at stage ~42?** Story
   needs a small ritual — given to a parent, to a teacher, kept in a
   notebook page in the app, pressed between book pages. Important because
   it's the first user-initiated narrative beat and sets the tone for Act
   III's closure.
2. **What happens after stage 50?** Options: the tree simply persists and
   the child can sit under it; a second seedling appears beside it,
   beginning a new tree (risk: implies endless grind); the tree continues
   through deeper Act III beats with seasonal cycles only. Pilot
   recommendation: it persists, and the child sees their full tree across
   seasons — no "you finished, here's a new game."
3. **How is the garden surfaced from the home screen?** A small "Visit your
   garden" link beside the mission card, never a forced detour. The child
   chooses when to look.
4. **How does the parent dashboard show this without being twee?** Suggested
   tile copy: *"Defne's laurel — Act II, stage 24. Last grew on Mon 28 Apr
   when `cautious` reached Light Green."* Honest, dated, no hype.
5. **What is the scenario abstraction's minimum viable surface?** Pilot
   ships laurel only, but the JSON shape (stages, captions, asset paths,
   care-action copy) must be designed once so future scenarios slot in
   without engine changes.

## Acceptance Criteria for the Reward Layer

The Laurel Journey is implemented correctly when:

- A child can complete a full pilot week (10–15 missions) and the tree only
  grows on stages where genuine mastery movement happened.
- A child who attended every day for two weeks but with weak spelling sees
  the tree pause at a sensible early stage, not break through into Act II.
- The tree never visibly regresses, even when words decay from green back
  to yellow.
- No XP number, growth-point count, or "X to next stage" indicator is
  visible to the child anywhere in the app.
- The parent dashboard tile shows a dated, plain-English reason for the
  most recent stage advance, sourced from `journey_events`.
- The garden page has zero interactive controls beyond navigation.
- All five care-action labels surface to the child as observations of past
  events, never as prompts to perform an action.
- Seed data and tests prove that the reward module is a pure function with
  a one-way dependency on learning state.
- Removing the journey module entirely leaves the learning engine and the
  child practice flow unchanged.
