ALTER TABLE learner_vocabulary_words
  ADD COLUMN priority_mode TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority_mode IN ('normal', 'next_round_once'));

ALTER TABLE learner_vocabulary_words
  ADD COLUMN priority_requested_at TEXT;

ALTER TABLE learner_vocabulary_words
  ADD COLUMN priority_consumed_at TEXT;

ALTER TABLE learner_spelling_items
  ADD COLUMN priority_mode TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority_mode IN ('normal', 'next_round_once'));

ALTER TABLE learner_spelling_items
  ADD COLUMN priority_requested_at TEXT;

ALTER TABLE learner_spelling_items
  ADD COLUMN priority_consumed_at TEXT;

CREATE INDEX idx_learner_vocabulary_words_priority
  ON learner_vocabulary_words(learner_id, status, priority_mode, priority_requested_at);

CREATE INDEX idx_learner_spelling_items_priority
  ON learner_spelling_items(learner_id, status, priority_mode, priority_requested_at);
