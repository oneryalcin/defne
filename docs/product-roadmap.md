# Product Roadmap

## Product Direction

Build a vocabulary learning game that combines:

- Deterministic spaced repetition.
- Contextual vocabulary practice.
- Spelling recall.
- Adaptive LLM hints and explanations.
- Visual memory anchors.
- A recurring stylised character and story world.

The product should grow from a focused parent/child vocabulary tool into a richer learning companion without losing control over correctness, privacy, or content quality.

The roadmap starts as a family pilot. Broad onboarding, full accessibility hardening, account management, and commercial packaging belong later, after the learning loop proves value for the initial parent/child pair.

The current visual concept prompts are stored in [Visual Concept Prompts](visual-concept-prompts.md).

MVP is split into two milestones:

- MVP-1A / Phase 1A: deterministic playable core.
- MVP-1B / Phase 1B: bounded AI tutor.

The first playable build is Phase 1A. The hybrid MVP is complete after Phase 1B.

## Phase 1A: Playable Core

Goal: prove the core daily learning loop.

Build:

- Next.js / React / TypeScript app.
- SQLite-backed local data.
- Parent/admin word entry.
- Seed word set.
- Child daily mission flow.
- Deterministic mastery engine.
- Meaning, usage, spelling, and confusable-word exercises.
- Practice attempt logging.
- Mastery colours.
- End-of-session progress summary.
- Cached standard avatar poses and backgrounds.

Do not depend on LLMs or image generation in this phase.

Exit criteria:

- A child can complete a session.
- The parent can add words.
- Attempts are saved.
- Mastery changes are visible.
- Weak words are selected more often than strong words.

## Phase 1B: Bounded AI Tutor

Goal: make help adaptive without turning the product into a chatbot.

Build:

- LLM provider abstraction.
- Generated hint ladders.
- Wrong-answer explanations.
- Fresh example sentences.
- Confusable-word explanations.
- Memory tricks.
- Prompt templates based on canonical word data.
- Generated content cache.
- Parent/admin review state for generated content.

Use learning history:

- Recent failures.
- Hint levels used.
- Confused words.
- Repeated spelling mistakes.
- Broad learner interests.

Boundaries:

- No free-form child chatbot.
- No AI answer marking.
- No AI-owned canonical definitions.
- No sensitive child profile data.

Exit criteria:

- Hints are relevant to the exact word and failure type.
- Generated explanations are stored and reusable.
- The deterministic engine still controls scoring.

## Phase 2: Visual Memory Layer

Goal: use visuals to improve retrieval and engagement.

Build:

- Visual mnemonic card model.
- Image prompt generation.
- Image provider abstraction.
- Parent approval/regeneration flow.
- Word-specific visual scenes.
- Consistent recurring avatar style.
- Mission map visual polish.

Image generation options can include OpenAI image models, Gemini/Nano Banana, or another provider behind the same abstraction.

Rules:

- Images represent meaning, not spelling.
- App UI renders all text.
- Do not rely on image models for accurate word spelling.
- Prefer a stylised fictional avatar over a realistic likeness.

Exit criteria:

- Difficult words can have approved visual anchors.
- The same visual anchor can reappear across sessions.
- Visual hints help recall without overwhelming the learning task.

## Phase 3: Engagement Modes

Goal: add variety while preserving learning quality.

Possible modes:

- Missing-letter puzzles.
- Word ladders.
- Sentence treasure hunts.
- Tricky-word boss rounds.
- Timed rescue rounds.
- Mini crosswords.
- Word-family challenges.
- Confusable-word duels.

Do not add games that fail to update mastery accurately. Every engagement mode should still produce useful learning signals.

Exit criteria:

- The child has more variety without losing the core daily session habit.
- Puzzle outcomes feed the same mastery engine.
- Spelling and production tasks remain represented.

## Phase 4: Smarter Learning Engine

Goal: tune the system from real usage.

Improve:

- Recall decay parameters.
- Stability updates.
- Failure-type classification.
- Question selection by weak dimension.
- Detection of forgotten-after-delay words.
- Handling of lucky guesses.
- Hint-weighted mastery updates.
- Long-term progress analytics.

Potential future directions:

- More advanced spaced-repetition model.
- Per-question difficulty calibration.
- Learner-specific response-time baselines.
- Better prediction of when a word is about to decay.

Exit criteria:

- The system predicts weak words better.
- Green words stay genuinely stable.
- Parent dashboard shows clearer learning evidence.

## Phase 5: Productisation

Goal: turn the local tool into a durable product.

Possible work:

- Broader onboarding for parents beyond the original pilot user.
- Accessibility hardening for public use.
- Authentication.
- Multiple child profiles.
- Cloud sync.
- Backups.
- Deployment.
- Import/export.
- Tutor or school mode.
- Printable reports.
- Subscription or payment model.
- Mobile packaging if needed.

Keep privacy central. The product handles a child learner and learning history, so account and sync design should be conservative.

Exit criteria:

- A family can use the app across devices.
- Data is backed up safely.
- Parent controls remain clear.
- The product can support more users without changing the learning model.

## Phase 6: Curriculum And Content Expansion

Goal: broaden content without diluting the vocabulary focus.

Possible additions:

- Curated GL-style vocabulary packs.
- Word-family packs.
- Spelling-trap packs.
- Confusable-word packs.
- Comprehension vocabulary packs.
- Parent-created custom packs.
- Tutor-shared packs.

Rules:

- Do not copy protected exam or commercial practice material.
- Keep canonical content reviewed and separate from generated content.
- Preserve British English spelling and age-appropriate tone.

Exit criteria:

- Parents can start with useful content quickly.
- Custom words remain easy to add.
- Generated enrichment supports, but does not replace, canonical content.

## Long-Term Product Vision

The app becomes a personalised vocabulary companion:

- It knows which words the child struggles with.
- It knows whether the weakness is meaning, usage, spelling, or delayed recall.
- It gives help in the right format.
- It uses a consistent visual story to make words memorable.
- It keeps the parent in control.
- It makes progress visible and motivating.

The product should stay vocabulary-first. Other English features can be added only when they strengthen the core learning loop.
