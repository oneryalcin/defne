ALTER TABLE learner_word_state ADD COLUMN recovery_debt INTEGER NOT NULL DEFAULT 0 CHECK (recovery_debt >= 0);
ALTER TABLE learner_word_state ADD COLUMN last_practiced_at TEXT;
ALTER TABLE learner_word_state ADD COLUMN last_clean_retrieval_at TEXT;
ALTER TABLE learner_word_state ADD COLUMN last_supported_success_at TEXT;
ALTER TABLE learner_word_state ADD COLUMN last_revealed_at TEXT;
ALTER TABLE learner_word_state ADD COLUMN last_exposed_at TEXT;
ALTER TABLE learner_word_state ADD COLUMN last_practiced_session_id TEXT REFERENCES practice_sessions(id) ON DELETE SET NULL;
ALTER TABLE learner_word_state ADD COLUMN last_practiced_interaction_index INTEGER;
ALTER TABLE learner_word_state ADD COLUMN learner_state_content_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE words ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;

CREATE INDEX idx_learner_word_state_recovery_debt ON learner_word_state(learner_id, recovery_debt, last_wrong_at, last_revealed_at);
CREATE INDEX idx_learner_word_state_last_practiced ON learner_word_state(learner_id, last_practiced_at);
