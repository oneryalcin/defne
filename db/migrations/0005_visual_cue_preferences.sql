ALTER TABLE learner_profiles ADD COLUMN visual_cues_enabled INTEGER NOT NULL DEFAULT 1 CHECK (visual_cues_enabled IN (0, 1));
