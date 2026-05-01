CREATE TABLE practice_rounds (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  current_step TEXT NOT NULL DEFAULT 'learn_cards' CHECK (current_step IN (
    'learn_cards',
    'meaning_recognition',
    'context_usage',
    'spelling_production'
  )),
  max_retry_passes INTEGER NOT NULL DEFAULT 3 CHECK (max_retry_passes > 0),
  word_ids_json TEXT NOT NULL,
  card_view_counts_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE practice_attempts ADD COLUMN round_id TEXT REFERENCES practice_rounds(id) ON DELETE SET NULL;
ALTER TABLE practice_attempts ADD COLUMN round_step TEXT CHECK (round_step IN (
  'learn_cards',
  'meaning_recognition',
  'context_usage',
  'spelling_production'
));
ALTER TABLE practice_attempts ADD COLUMN pass_number INTEGER CHECK (pass_number IS NULL OR pass_number > 0);
ALTER TABLE practice_attempts ADD COLUMN attempt_number_for_word_in_step INTEGER CHECK (
  attempt_number_for_word_in_step IS NULL OR attempt_number_for_word_in_step > 0
);
ALTER TABLE practice_attempts ADD COLUMN first_attempt_correct INTEGER CHECK (first_attempt_correct IN (0, 1));
ALTER TABLE practice_attempts ADD COLUMN eventually_correct INTEGER CHECK (eventually_correct IN (0, 1));
ALTER TABLE practice_attempts ADD COLUMN reveal_and_move_on INTEGER NOT NULL DEFAULT 0 CHECK (reveal_and_move_on IN (0, 1));

CREATE INDEX idx_practice_rounds_session ON practice_rounds(session_id);
CREATE INDEX idx_practice_rounds_learner_status ON practice_rounds(learner_id, status);
CREATE INDEX idx_practice_attempts_round_step ON practice_attempts(round_id, round_step, pass_number);
