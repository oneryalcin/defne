# Round-based vocabulary mode

Status: current vocabulary flow.

Vocabulary rounds are meaning/context practice only. Spelling is intentionally
not a dimension of vocabulary state; it will be added as a separate practice
area with its own word set and scheduler state.

Current round sequence:

1. `learn_cards`
   - word
   - definition
   - approved examples
   - synonyms, antonyms, and confusables when available
   - optional visual cue from approved example imagery
2. `meaning_recognition`
   - definition, synonym, or antonym recognition
3. `context_usage`
   - sentence usage, fill sentence, or confusable-choice recognition

Selection is defined by [Learning Selection Algorithm](learning-selection-algorithm.md).
The selector uses scheduler state such as attempts, retrieval timestamps,
recovery debt, stability, and content version. It does not use legacy
`meaning_mastery`, `usage_mastery`, or `spelling_mastery` fields.

Round summaries should stay vocabulary-specific:

- first-attempt secure words
- eventually-correct words
- reveal-and-move-on words
- near-review words
- selection reasons
- mistake evidence for meaning/context steps

Do not add spelling-specific fields back into vocabulary summaries. When
spelling ships, model it as its own practice area/deck so the parent can manage
its words independently.
