UPDATE learner_profiles
SET next_round_new_count = 6,
    next_round_recovery_count = 3,
    next_round_review_count = 3,
    next_round_stable_count = 0
WHERE next_round_new_count = 3
  AND next_round_recovery_count = 4
  AND next_round_review_count = 4
  AND next_round_stable_count = 1;
