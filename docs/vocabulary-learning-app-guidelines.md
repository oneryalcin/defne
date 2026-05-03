# Vocabulary learning app guidelines

Status: current vocabulary-mode guidance.

Defne vocabulary practice should help a child learn word meaning and contextual
use. Spelling is important, but it should be implemented as a separate practice
area with its own parent-managed word set.

## Vocabulary Principles

- Parent-reviewed canonical content is the source of truth.
- Generated drafts must be editable before saving.
- Examples should teach the word in context, not just contain the word.
- Visual cues should support meaning and memory, not decorate the UI.
- Child practice should stay calm, fast, and forgiving.
- Scheduler behavior should stay deterministic and inspectable.

## Vocabulary Content

Each vocabulary word can have:

- word
- definition
- three or more useful examples
- synonyms
- antonyms
- confusables
- approved example-linked visual cues

Do not attach spelling notes to vocabulary words. When spelling mode is added,
store spelling traps and spelling prompts under that practice area.

## Vocabulary Practice

Vocabulary rounds use:

- learn cards
- meaning recognition
- context usage
- confusable recognition when useful
- recovery for wrong answers and reveals

The selector uses scheduler evidence from attempts, timestamps, stability,
recovery debt, and content version. It does not use per-dimension mastery
columns.

## Spelling Direction

Spelling mode should be separate:

- separate word list
- separate scheduler state
- separate parent management surface
- separate child entry point

The same text can appear in both vocabulary and spelling lists, but that should
be a deliberate parent choice rather than implicit shared state.
