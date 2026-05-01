CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE learners (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE learner_profiles (
  learner_id TEXT PRIMARY KEY REFERENCES learners(id) ON DELETE CASCADE,
  year_group TEXT NOT NULL DEFAULT 'Year 5',
  locale TEXT NOT NULL DEFAULT 'en-GB',
  interests_json TEXT NOT NULL DEFAULT '[]',
  avatar_style TEXT NOT NULL DEFAULT 'pencil_drawing',
  avatar_traits_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE words (
  id TEXT PRIMARY KEY,
  word TEXT NOT NULL,
  normalized_word TEXT NOT NULL UNIQUE,
  difficulty_level INTEGER NOT NULL DEFAULT 1 CHECK (difficulty_level BETWEEN 1 AND 5),
  source TEXT NOT NULL CHECK (source IN ('seed', 'parent', 'import')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE word_definitions (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  definition TEXT NOT NULL,
  part_of_speech TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE word_examples (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  sentence TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('canonical', 'parent', 'generated')),
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'rejected', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE word_synonyms (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  synonym TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE word_antonyms (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  antonym TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE word_confusables (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  confusable_word_id TEXT REFERENCES words(id) ON DELETE SET NULL,
  confusable_text TEXT,
  explanation TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (confusable_word_id IS NOT NULL OR confusable_text IS NOT NULL)
);

CREATE TABLE spelling_notes (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  tricky_part TEXT,
  pattern TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE learner_word_state (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,

  meaning_mastery REAL NOT NULL DEFAULT 0 CHECK (meaning_mastery >= 0 AND meaning_mastery <= 1),
  usage_mastery REAL NOT NULL DEFAULT 0 CHECK (usage_mastery >= 0 AND usage_mastery <= 1),
  spelling_mastery REAL NOT NULL DEFAULT 0 CHECK (spelling_mastery >= 0 AND spelling_mastery <= 1),

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

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE (learner_id, word_id)
);

CREATE TABLE practice_sessions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'daily_mission' CHECK (mode IN ('daily_mission', 'review', 'debug')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  target_question_count INTEGER NOT NULL DEFAULT 15 CHECK (target_question_count > 0),
  actual_question_count INTEGER NOT NULL DEFAULT 0 CHECK (actual_question_count >= 0),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  summary_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE practice_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,

  question_type TEXT NOT NULL CHECK (question_type IN (
    'definition_choice',
    'synonym_choice',
    'antonym_choice',
    'sentence_usage_choice',
    'fill_sentence',
    'confusable_choice',
    'spelling_choice',
    'type_from_memory'
  )),

  prompt_json TEXT NOT NULL,
  expected_answer_json TEXT NOT NULL,
  submitted_answer TEXT,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),

  hint_level_used INTEGER NOT NULL DEFAULT 0 CHECK (hint_level_used >= 0),
  max_hint_level_available INTEGER NOT NULL DEFAULT 0 CHECK (max_hint_level_available >= 0),
  response_time_ms INTEGER NOT NULL DEFAULT 0 CHECK (response_time_ms >= 0),

  failure_type TEXT CHECK (failure_type IN (
    'none',
    'meaning_unknown',
    'confused_with_similar_word',
    'spelling_error',
    'recognised_but_could_not_produce',
    'too_slow',
    'guessed',
    'forgot_after_delay'
  )),

  created_at TEXT NOT NULL
);

CREATE TABLE generated_hints (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  learner_id TEXT REFERENCES learners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_context_json TEXT NOT NULL,
  hint_levels_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'disabled')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE generated_examples (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  learner_id TEXT REFERENCES learners(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_context_json TEXT NOT NULL,
  sentence TEXT NOT NULL,
  explanation TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'disabled')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE generated_images (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  learner_id TEXT REFERENCES learners(id) ON DELETE CASCADE,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  prompt TEXT NOT NULL,
  image_path TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'disabled')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_words_status ON words(status);
CREATE INDEX idx_learner_word_state_learner_colour ON learner_word_state(learner_id, mastery_colour);
CREATE INDEX idx_learner_word_state_next_review ON learner_word_state(learner_id, next_review_at);
CREATE INDEX idx_practice_sessions_learner_started ON practice_sessions(learner_id, started_at);
CREATE INDEX idx_practice_attempts_session ON practice_attempts(session_id);
CREATE INDEX idx_practice_attempts_learner_word ON practice_attempts(learner_id, word_id, created_at);
CREATE INDEX idx_generated_hints_word_status ON generated_hints(word_id, status);
CREATE INDEX idx_generated_examples_word_status ON generated_examples(word_id, status);
CREATE INDEX idx_generated_images_word_status ON generated_images(word_id, status);
