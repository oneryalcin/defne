DROP TABLE IF EXISTS generated_images;

CREATE TABLE example_visual_cues (
  id TEXT PRIMARY KEY,
  example_id TEXT NOT NULL REFERENCES word_examples(id) ON DELETE CASCADE,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  provider TEXT,
  model TEXT,
  prompt_version TEXT,
  prompt TEXT,
  image_path TEXT,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'disabled')),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (image_path IS NOT NULL OR image_url IS NOT NULL)
);

CREATE INDEX idx_example_visual_cues_example_status ON example_visual_cues(example_id, status);
CREATE INDEX idx_example_visual_cues_word_status ON example_visual_cues(word_id, status);
