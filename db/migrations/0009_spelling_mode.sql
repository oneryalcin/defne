CREATE TABLE spelling_items (
  id TEXT PRIMARY KEY,
  target_word TEXT NOT NULL,
  normalized_target TEXT NOT NULL UNIQUE,
  difficulty_level INTEGER NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  source TEXT NOT NULL CHECK (source IN ('seed', 'parent', 'import')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE spelling_prompts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES spelling_items(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('canonical', 'parent', 'generated')),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'rejected', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE spelling_sessions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  target_item_count INTEGER NOT NULL DEFAULT 8 CHECK (target_item_count > 0),
  actual_question_count INTEGER NOT NULL DEFAULT 0 CHECK (actual_question_count >= 0),
  item_ids_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE spelling_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spelling_sessions(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES spelling_items(id) ON DELETE CASCADE,
  prompt_id TEXT REFERENCES spelling_prompts(id) ON DELETE SET NULL,
  prompt_json TEXT NOT NULL,
  expected_answer_json TEXT NOT NULL,
  submitted_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  response_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (response_time_ms >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_spelling_items_status ON spelling_items(status);
CREATE INDEX idx_spelling_prompts_item_status ON spelling_prompts(item_id, status);
CREATE INDEX idx_spelling_sessions_learner_status ON spelling_sessions(learner_id, status);
CREATE INDEX idx_spelling_attempts_session ON spelling_attempts(session_id);
CREATE INDEX idx_spelling_attempts_learner_item ON spelling_attempts(learner_id, item_id, created_at);
