ALTER TABLE learner_profiles
  ADD COLUMN visual_cue_generation_enabled INTEGER NOT NULL DEFAULT 0 CHECK (visual_cue_generation_enabled IN (0, 1));
