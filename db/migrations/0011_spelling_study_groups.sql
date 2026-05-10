ALTER TABLE spelling_items
  ADD COLUMN study_group TEXT NOT NULL DEFAULT '';

ALTER TABLE spelling_items
  ADD COLUMN usage_label TEXT NOT NULL DEFAULT '';
