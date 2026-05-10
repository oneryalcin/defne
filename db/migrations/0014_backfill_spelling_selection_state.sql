INSERT OR IGNORE INTO spelling_learner_state (
  id,
  learner_id,
  item_id,
  last_seen_at,
  last_correct_at,
  last_wrong_at,
  attempt_count,
  correct_count,
  wrong_count,
  average_response_time_ms,
  failure_types_json,
  near_review,
  recovery_debt,
  last_practiced_at,
  last_clean_retrieval_at,
  last_supported_success_at,
  last_exposed_at,
  created_at,
  updated_at
)
SELECT
  'spelling_state_' || learner_id || '_' || item_id,
  learner_id,
  item_id,
  MAX(created_at) AS last_seen_at,
  MAX(CASE WHEN is_correct = 1 THEN created_at ELSE NULL END) AS last_correct_at,
  MAX(CASE WHEN is_correct = 0 THEN created_at ELSE NULL END) AS last_wrong_at,
  COUNT(*) AS attempt_count,
  SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_count,
  SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
  AVG(response_time_ms) AS average_response_time_ms,
  CASE WHEN SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) > 0 THEN '["spelling_error"]' ELSE '[]' END AS failure_types_json,
  CASE
    WHEN SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) > SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) THEN 1
    ELSE 0
  END AS near_review,
  CASE
    WHEN SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) - SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) >= 3 THEN 3
    WHEN SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) - SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) > 0 THEN SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) - SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END)
    ELSE 0
  END AS recovery_debt,
  MAX(created_at) AS last_practiced_at,
  CASE
    WHEN SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) = 0 THEN MAX(CASE WHEN is_correct = 1 THEN created_at ELSE NULL END)
    ELSE NULL
  END AS last_clean_retrieval_at,
  CASE
    WHEN SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END) > 0 THEN MAX(CASE WHEN is_correct = 1 THEN created_at ELSE NULL END)
    ELSE NULL
  END AS last_supported_success_at,
  MAX(created_at) AS last_exposed_at,
  MIN(created_at) AS created_at,
  MAX(created_at) AS updated_at
FROM spelling_attempts
GROUP BY learner_id, item_id;
