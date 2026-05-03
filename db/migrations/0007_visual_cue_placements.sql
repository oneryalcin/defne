ALTER TABLE learner_profiles
  ADD COLUMN visual_cues_on_learn_cards INTEGER NOT NULL DEFAULT 1 CHECK (visual_cues_on_learn_cards IN (0, 1));

ALTER TABLE learner_profiles
  ADD COLUMN visual_cues_on_meaning_questions INTEGER NOT NULL DEFAULT 0 CHECK (visual_cues_on_meaning_questions IN (0, 1));

ALTER TABLE learner_profiles
  ADD COLUMN visual_cues_on_context_questions INTEGER NOT NULL DEFAULT 0 CHECK (visual_cues_on_context_questions IN (0, 1));
