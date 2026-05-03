# Implementation plan

Status: current high-level plan.

## Vocabulary Mode

The active product is vocabulary practice. Keep it focused on meaning and
contextual use.

Main paths:

- Parent word management.
- Parent-reviewed generated drafts for definitions, examples, related words,
  and visual cues.
- Child round flow:
  - learn cards
  - meaning recognition
  - context usage
- V2 round selection from [Learning Selection Algorithm](learning-selection-algorithm.md).

Do not reintroduce spelling-specific vocabulary fields. The removed legacy
model used `meaning_mastery`, `usage_mastery`, `spelling_mastery`, and
vocabulary `spelling_notes`; those are no longer active state.

## Spelling Mode

Spelling should be implemented as a separate practice area, not as a vocabulary
dimension.

When it is added, design it with:

- its own parent-managed word set
- its own learner scheduler state
- its own session/round mode
- spelling-specific prompts and review surfaces

The spelling list may contain words that also exist in vocabulary. That is a
product-level duplicate, not shared scheduler state.

## Multi-Learner Direction

Before adding more pilot families, replace singleton learner assumptions with:

- child/parent users
- learner profiles
- parent-to-learner links
- server-side authorization for selected learner access
- repository APIs that accept explicit learner context

## Verification

Meaningful changes should run:

```bash
npm run test
npm run typecheck
npm run build
```

Schema changes should also run:

```bash
npm run db:setup
```
