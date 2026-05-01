ALTER TABLE learner_word_state ADD COLUMN near_review INTEGER NOT NULL DEFAULT 0 CHECK (near_review IN (0, 1));
ALTER TABLE learner_word_state ADD COLUMN eligible_questions_since_last_mistake INTEGER NOT NULL DEFAULT 0 CHECK (
  eligible_questions_since_last_mistake >= 0
);

CREATE INDEX idx_learner_word_state_near_review ON learner_word_state(learner_id, near_review, next_review_at);
