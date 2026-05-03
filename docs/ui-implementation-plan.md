# UI implementation plan

Status: current vocabulary UI guidance.

## Child UI

`/child` currently opens the vocabulary practice entry point. When spelling is
added, `/child` should become a practice-area hub with separate cards for
vocabulary and spelling.

Vocabulary practice should show:

- learn cards with definition, examples, related words, and optional visual cue
- meaning recognition questions
- context usage questions
- calm recovery after wrong answers or reveals
- round summary with vocabulary-specific evidence

Do not show spelling meters or spelling traps inside vocabulary rounds.

## Parent UI

Parent vocabulary screens should support fast review and correction:

- add/edit vocabulary word
- generate parent-reviewed draft content
- review example-linked visual cues
- inspect why a word is scheduled
- inspect recent meaning/context mistakes

When spelling ships, add a separate parent surface for spelling words rather
than mixing spelling fields into vocabulary forms.

## Suggested Application APIs

```ts
getMissionPreview({ learnerId, practiceAreaId }): MissionPreview
startRoundMission({ learnerId, practiceAreaId }): PracticeSession
getSessionView(sessionId): SessionView
submitAttempt(sessionId, answer, hintLevelUsed): AttemptResult
getSessionSummary(sessionId): SessionSummary
```

The current implementation still has singleton learner assumptions. New UI
work should avoid adding more implicit learner/global state.
