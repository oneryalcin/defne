# UI Implementation Plan

## Purpose

Translate the visual concepts and MVP scope into a buildable UI plan.

This is not a final visual design spec. It defines the first playable screen set, component boundaries, and where the UI depends on the engineering foundation.

## Source References

Use these as directional references:

- Product scope: [MVP Scope](mvp-scope.md)
- Build sequence: [Implementation Plan](implementation-plan.md)
- Learning algorithm: [Mastery Scoring And Session Selection](mastery-scoring-and-session-selection.md)
- SQLite schema: [Data Model](data-model.md)
- Visual prompts and mockups: [Visual Concept Prompts](visual-concept-prompts.md)
- Raw vocabulary backlog: [parent-vocabulary-backlog.json](../data/vocabulary/parent-vocabulary-backlog.json)
- Enriched MVP vocabulary seed: [mvp-seed-vocabulary.json](../data/vocabulary/mvp-seed-vocabulary.json)

Saved concept images:

- [01-product-overview.png](assets/visual-concepts/01-product-overview.png)
- [02-child-daily-mission-loop.png](assets/visual-concepts/02-child-daily-mission-loop.png)
- [03-hint-mistake-recovery.png](assets/visual-concepts/03-hint-mistake-recovery.png)
- [04-visual-memory-story.png](assets/visual-concepts/04-visual-memory-story.png)

## Design North Star

The strongest MVP direction is the child daily mission loop:

1. Mission start.
2. Focused practice.
3. Hint or recovery when needed.
4. End-of-session reflection.
5. Parent sees what changed.

The later visual-memory/story direction is important, but it should not delay the first playable learning loop.

## Pilot UX Priorities

Optimise for:

- Clear, focused learning time.
- Short missions that feel bounded.
- Contextual vocabulary practice rather than flashcards.
- Spelling and meaning treated separately.
- Gentle mistake recovery.
- Parent-visible learning evidence.

Do not optimise MVP-1A for:

- Public onboarding.
- Full marketplace polish.
- Social-style rewards.
- Advanced puzzle modes.
- Full image generation pipeline.
- Account management.

## Routes

Suggested first route structure:

```text
/
  Home / mode switch

/child
  Child mission start

/child/session/[sessionId]
  Active practice question flow

/child/session/[sessionId]/summary
  End-of-session reflection

/parent
  Parent dashboard

/parent/words
  Word list and add/edit entry

/parent/words/new
  Add word manually

/parent/import
  Paste batch words

/parent/generated
  Future generated content review, mostly dormant in MVP-1A
```

For the family pilot, `/` can be a simple switch between child and parent modes. Authentication is deferred.

## MVP-1A Screens

### 1. Home / Mode Switch

Purpose:

- Let the family choose child practice or parent view.

Required UI:

- Child practice entry.
- Parent dashboard entry.
- Simple local status: seed data loaded / no words yet.

Avoid:

- Marketing copy.
- Public signup framing.

### 2. Child Mission Start

Reference:

- [02-child-daily-mission-loop.png](assets/visual-concepts/02-child-daily-mission-loop.png)

Purpose:

- Make the session feel bounded and worth starting.

Required UI:

- Mission title.
- Estimated time, around 10 to 15 minutes.
- Number of questions.
- Today's focus words.
- Mastery labels for selected words.
- Cached avatar pose.
- Start button.

Learning data required:

- Candidate words from session selection.
- Mastery colour and weakest dimension.
- Whether each word is new, due, weak, or almost mastered.

### 3. Active Practice

Reference:

- [02-child-daily-mission-loop.png](assets/visual-concepts/02-child-daily-mission-loop.png)
- [03-hint-mistake-recovery.png](assets/visual-concepts/03-hint-mistake-recovery.png)

Purpose:

- Deliver one focused retrieval task at a time.

Required UI:

- Progress indicator, such as `Question 4 of 14`.
- Current word or sentence prompt.
- Answer input area.
- Hint button.
- Mastery dimensions: Meaning, Usage, Spelling.
- Gentle avatar/helper area.
- Submit/continue control.

Question variants for MVP-1A:

- Definition choice.
- Synonym choice.
- Antonym choice.
- Sentence usage choice.
- Fill sentence.
- Confusable choice.
- Spelling choice.
- Type from memory.

State handling:

- unanswered
- answered correct
- answered wrong
- hint opened
- correction shown
- continue to next question

Avoid:

- Full-screen celebration after every correct answer.
- Harsh failure states.
- Showing too many stats during the question.
- Letting visual decoration compete with the prompt.

### 4. Hint And Recovery State

Reference:

- [03-hint-mistake-recovery.png](assets/visual-concepts/03-hint-mistake-recovery.png)

Purpose:

- Make mistakes productive and low-shame.

Required UI:

- Current hint level.
- Collapsed future hint levels.
- Calm feedback copy.
- For spelling mistakes, show typed answer vs canonical answer.
- Highlight the specific spelling trap when known.
- Store hint level used in the attempt.

MVP-1A:

- Deterministic hints from canonical content and spelling notes.

MVP-1B:

- Approved generated hints can replace or augment deterministic hints.
- Fallback remains deterministic.

### 5. Session Summary

Reference:

- [02-child-daily-mission-loop.png](assets/visual-concepts/02-child-daily-mission-loop.png)

Purpose:

- Close the session with learning movement, not a generic score.

Required UI:

- Words improved.
- Spelling traps found.
- Words to revisit tomorrow.
- Short mastery movement display.
- Calm avatar celebration.
- Return to home / practise another short round.

Avoid:

- Ranking, streak pressure, or reward-chasing emphasis.
- Percent-only score.

### 6. Parent Dashboard

Reference:

- [01-product-overview.png](assets/visual-concepts/01-product-overview.png)

Purpose:

- Help parent know what is sticking and what needs attention.

Required UI:

- Latest session summary.
- Red/orange words.
- Repeated spelling mistakes.
- Forgotten-after-delay words.
- Words close to green.
- Suggested next focus.

Data required:

- `learner_word_state`
- recent `practice_sessions`
- recent `practice_attempts`
- failure types

### 7. Parent Word Entry

Purpose:

- Let parent add real difficult words quickly enough for the pilot.

Required UI:

- Word.
- Definition.
- Example sentence.
- Synonym.
- Antonym/contrast.
- Spelling note.
- Confusable word.
- Difficulty.

Batch paste MVP:

- Paste multiple words.
- Create incomplete word rows.
- Show which canonical fields still need completion.

Avoid:

- Making the parent complete every enrichment field before testing the child flow.
- Multi-step content publishing workflow in MVP-1A.

### 8. Generated Content Review Placeholder

Purpose:

- Reserve the later MVP-1B surface without building unnecessary workflow in MVP-1A.

MVP-1A:

- May show an empty/disabled page explaining that generated content is not active yet.

MVP-1B:

- Review generated hints/examples.
- Approve, reject, disable, regenerate.
- Show provider, model, prompt version, and created time.

## Later Screens

### Visual Memory Card

Reference:

- [04-visual-memory-story.png](assets/visual-concepts/04-visual-memory-story.png)

Purpose:

- Attach a stable visual scene to a difficult word.

Later-stage UI:

- Word.
- Meaning.
- Example sentence.
- Recall prompt.
- Visual scene.
- Meaning / Usage / Spelling progress.
- Approval state.

Important rule:

- The app UI renders the word and text. Generated images should not be trusted for text.

### Story Map

Reference:

- [04-visual-memory-story.png](assets/visual-concepts/04-visual-memory-story.png)

Purpose:

- Organise visual memory anchors into a journey.

Keep this lightweight. It should support recall, not become a distracting game world.

## Component Boundaries

Suggested components:

```text
AppShell
ModeSwitch

ChildMissionStart
MissionFocusWordList
MissionProgress
AvatarGuide

QuestionCard
AnswerChoiceList
TextAnswerInput
HintPanel
CorrectionPanel
MasteryDimensionMeters
MasteryBadge

SessionSummary
LearningMovementList
SpellingTrapList
TomorrowReviewList

ParentDashboard
WordStatusTable
SpellingMistakeTable
RecentSessionSummary
SuggestedFocusPanel

WordForm
BatchWordImport
IncompleteWordChecklist

GeneratedContentReview
VisualMemoryCard
StoryMap
```

## Visual System

Use the concept images as tone references, not literal assets.

Base direction:

- Warm paper/off-white backgrounds.
- Graphite pencil illustration accents.
- Forest green for positive/stable.
- Amber/yellow for in-progress.
- Coral/red for weak/needs attention, not harsh failure.
- Soft blue for hints/support.
- Slate text.

Mastery colours must have text labels:

```text
Red: New / Needs work
Orange: Building
Yellow: Nearly steady
Light green: Reliable
Green: Mastered
```

The UI can use cached avatar/background images in MVP-1A. These can be simple generated assets copied into the repo later. The React UI itself should own layout, text, buttons, meters, and state.

## Interaction Rules

Child flow:

- One main task per screen.
- Always show current progress.
- Hint is available but not forced.
- Wrong answer produces next useful step.
- Spelling correction highlights exact difference.
- Session can end cleanly after the planned question count.

Parent flow:

- Parent sees evidence, not just raw logs.
- Word entry should accept incomplete enrichment during pilot.
- Dashboard should show next useful action.

## Engineering Dependencies

Before serious UI implementation, engineering should decide:

1. App scaffold and routing convention.
2. SQLite access layer and migration runner.
3. Seed word data format.
4. Learning engine module API.
5. Question generation API.
6. Attempt recording API.
7. Static asset path convention for avatar/background images.

The most important engineering risk is coupling UI directly to database details. Build a small application layer between UI and SQLite so screens consume session/question/progress objects rather than raw tables.

## Suggested Application APIs

The UI should ideally call functions shaped like:

```ts
getMissionPreview(learnerId): MissionPreview
startDailyMission(learnerId): PracticeSession
getCurrentQuestion(sessionId): PracticeQuestion
submitAttempt(sessionId, answer, hintLevelUsed): AttemptResult
getSessionSummary(sessionId): SessionSummary

getParentDashboard(learnerId): ParentDashboardSummary
createWord(input): Word
createWordsFromPaste(text): BatchImportResult
updateWord(wordId, input): Word
```

This keeps React focused on interaction and presentation.

## MVP-1A UI Acceptance Checks

- Child can start a mission from `/child`.
- Child sees exactly one question at a time.
- Child can answer at least 5 question types.
- Child can request deterministic hints.
- Wrong spelling shows a correction state.
- Session summary shows learning movement.
- Parent dashboard reflects actual saved attempts.
- Parent can add a word and see it enter the practice pool.
- App works without LLM keys or image-generation APIs.
- Cached avatar/background visuals render without blocking the question.

## Engineering Focus Before Coding

Yes, engineering should now be tightened before building the UI.

Minimum engineering artifacts to create next:

- `package.json` / app scaffold.
- `db/migrations/0001_initial_schema.sql`.
- Seed data file with 20 to 50 words.
- Learning engine module and tests.
- Question generation module and tests.
- Minimal data access layer.

Once those exist, UI work can proceed without mocking the core learning behaviour too heavily.

## First Build Recommendation

Build in this order:

1. SQLite schema and seed data.
2. Learning engine tests.
3. Question generator tests.
4. Minimal child mission UI.
5. Attempt recording.
6. Session summary.
7. Parent dashboard.
8. Visual polish using cached avatar/background assets.

The concept images should guide visual hierarchy and tone, but the first working app should prove the learning loop before visual memory generation or puzzle modes.
