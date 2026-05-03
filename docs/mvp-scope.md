# MVP scope

Status: current after vocabulary/spelling separation.

Defne currently ships a local-first vocabulary practice loop for one pilot
learner and one pilot parent. Vocabulary practice teaches word meaning and
contextual use through parent-reviewed canonical content, short child rounds,
and inspectable scheduling.

## In Scope Now

- Parent-managed vocabulary words.
- Parent-reviewed definitions, examples, synonyms, antonyms, confusables, and
  visual cue images.
- Child vocabulary rounds:
  - learn cards
  - meaning recognition
  - context usage
- Round selection using the current V2 scheduler:
  - attempts
  - clean retrieval timestamps
  - supported success timestamps
  - wrong/reveal timestamps
  - recovery debt
  - stability days
  - mastery colour
  - content version
- Parent dashboard for vocabulary status and recent round evidence.

## Out Of Scope For Current Vocabulary Mode

- Spelling practice.
- Spelling notes attached to vocabulary words.
- Per-word `meaning_mastery`, `usage_mastery`, or `spelling_mastery` columns.
- Per-dimension mastery meters.

Spelling should be added as a separate practice area with its own managed word
set and scheduler state. A spelling word may duplicate a vocabulary word, but
the parent should control the two lists independently.

## Acceptance Criteria

- Vocabulary practice works without network access.
- SQLite remains the source of truth.
- Generated content is reviewable before it becomes trusted learning material.
- AI-generated hints/images do not directly change correctness or scheduling.
- Parent edits to canonical content reset affected learner-word scheduling
  evidence.
- Current algorithm docs and schema agree with the runtime code.
