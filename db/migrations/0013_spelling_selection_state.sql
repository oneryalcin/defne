ALTER TABLE spelling_items ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE spelling_learner_state (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES spelling_items(id) ON DELETE CASCADE,

  stability_days REAL NOT NULL DEFAULT 1 CHECK (stability_days >= 1),
  mastery_colour TEXT NOT NULL DEFAULT 'red' CHECK (mastery_colour IN ('red', 'orange', 'yellow', 'light_green', 'green')),

  last_seen_at TEXT,
  last_correct_at TEXT,
  last_wrong_at TEXT,
  next_review_at TEXT,

  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  wrong_count INTEGER NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),

  last_hint_level_used INTEGER,
  average_hint_level_used REAL NOT NULL DEFAULT 0,
  average_response_time_ms REAL NOT NULL DEFAULT 0,

  failure_types_json TEXT NOT NULL DEFAULT '[]',
  confused_with_word_ids_json TEXT NOT NULL DEFAULT '[]',

  near_review INTEGER NOT NULL DEFAULT 0 CHECK (near_review IN (0, 1)),
  eligible_questions_since_last_mistake INTEGER NOT NULL DEFAULT 0 CHECK (eligible_questions_since_last_mistake >= 0),
  recovery_debt INTEGER NOT NULL DEFAULT 0 CHECK (recovery_debt >= 0),
  last_practiced_at TEXT,
  last_clean_retrieval_at TEXT,
  last_supported_success_at TEXT,
  last_revealed_at TEXT,
  last_exposed_at TEXT,
  last_practiced_session_id TEXT REFERENCES spelling_sessions(id) ON DELETE SET NULL,
  last_practiced_interaction_index INTEGER,
  learner_state_content_version INTEGER NOT NULL DEFAULT 1,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (learner_id, item_id)
);

CREATE INDEX idx_spelling_learner_state_learner_colour ON spelling_learner_state(learner_id, mastery_colour);
CREATE INDEX idx_spelling_learner_state_next_review ON spelling_learner_state(learner_id, next_review_at);
CREATE INDEX idx_spelling_learner_state_recovery_debt ON spelling_learner_state(learner_id, recovery_debt, last_wrong_at, last_revealed_at);
CREATE INDEX idx_spelling_learner_state_last_practiced ON spelling_learner_state(learner_id, last_practiced_at);
