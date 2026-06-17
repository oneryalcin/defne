ALTER TABLE learner_profiles
  ADD COLUMN spelling_round_new_count INTEGER NOT NULL DEFAULT 3
  CHECK (spelling_round_new_count BETWEEN 0 AND 8);

ALTER TABLE learner_profiles
  ADD COLUMN spelling_round_recovery_count INTEGER NOT NULL DEFAULT 3
  CHECK (spelling_round_recovery_count BETWEEN 0 AND 8);

ALTER TABLE learner_profiles
  ADD COLUMN spelling_round_review_count INTEGER NOT NULL DEFAULT 2
  CHECK (spelling_round_review_count BETWEEN 0 AND 8);

ALTER TABLE learner_profiles
  ADD COLUMN spelling_round_stable_count INTEGER NOT NULL DEFAULT 0
  CHECK (spelling_round_stable_count BETWEEN 0 AND 8);
