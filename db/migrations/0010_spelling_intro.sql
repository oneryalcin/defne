ALTER TABLE spelling_items
  ADD COLUMN teaching_note TEXT NOT NULL DEFAULT '';

ALTER TABLE spelling_sessions
  ADD COLUMN intro_completed_at TEXT;
