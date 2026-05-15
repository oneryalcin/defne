CREATE TABLE learner_access_codes (
  access_code TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (learner_id)
);

CREATE TABLE learner_vocabulary_words (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  assigned_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (learner_id, word_id)
);

CREATE TABLE learner_spelling_items (
  learner_id TEXT NOT NULL REFERENCES learners(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES spelling_items(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  assigned_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (learner_id, item_id)
);

CREATE INDEX idx_learner_vocabulary_words_word ON learner_vocabulary_words(word_id, status);
CREATE INDEX idx_learner_spelling_items_item ON learner_spelling_items(item_id, status);

INSERT OR IGNORE INTO learner_access_codes (access_code, learner_id, created_at, updated_at)
SELECT 'arina', 'learner_defne', created_at, updated_at
FROM learners
WHERE id = 'learner_defne';

INSERT OR IGNORE INTO learner_vocabulary_words (learner_id, word_id, status, assigned_at, created_at, updated_at)
SELECT l.id, w.id, 'active', COALESCE(w.created_at, l.created_at), COALESCE(w.created_at, l.created_at), COALESCE(w.updated_at, l.updated_at)
FROM learners l
CROSS JOIN words w
WHERE w.status = 'active';

INSERT OR IGNORE INTO learner_spelling_items (learner_id, item_id, status, assigned_at, created_at, updated_at)
SELECT l.id, i.id, 'active', COALESCE(i.created_at, l.created_at), COALESCE(i.created_at, l.created_at), COALESCE(i.updated_at, l.updated_at)
FROM learners l
CROSS JOIN spelling_items i
WHERE i.status = 'active';
