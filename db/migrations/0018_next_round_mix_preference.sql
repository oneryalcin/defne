ALTER TABLE learner_profiles
  ADD COLUMN next_round_new_count INTEGER NOT NULL DEFAULT 3
  CHECK (next_round_new_count BETWEEN 0 AND 12);

ALTER TABLE learner_profiles
  ADD COLUMN next_round_recovery_count INTEGER NOT NULL DEFAULT 4
  CHECK (next_round_recovery_count BETWEEN 0 AND 12);

ALTER TABLE learner_profiles
  ADD COLUMN next_round_review_count INTEGER NOT NULL DEFAULT 4
  CHECK (next_round_review_count BETWEEN 0 AND 12);

ALTER TABLE learner_profiles
  ADD COLUMN next_round_stable_count INTEGER NOT NULL DEFAULT 1
  CHECK (next_round_stable_count BETWEEN 0 AND 12);
