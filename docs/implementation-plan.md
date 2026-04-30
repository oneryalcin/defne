# Implementation Plan

## Purpose

Turn the MVP scope into an executable build plan with concrete acceptance checks.

This plan resolves the main sequencing decision:

- MVP-1A is the deterministic first playable build.
- MVP-1B adds bounded LLM tutoring.
- Full image generation and puzzle modes come later.

## Milestone Summary

MVP-1A:

- Build the app scaffold.
- Create SQLite schema and migrations.
- Seed learner and word data.
- Build deterministic learning engine.
- Build child daily mission flow.
- Build parent/admin word and progress views.
- Use cached avatar/background visuals.
- Run without network or LLM dependencies.

MVP-1B:

- Add LLM provider abstraction.
- Add prompt templates and generated-content storage.
- Add bounded hint ladders and wrong-answer explanations.
- Add parent/admin review controls.
- Add fallback to deterministic hints when generation fails.

## Phase 1A Build Sequence

### 1. App Scaffold

Build:

- Next.js / React / TypeScript app.
- Basic app shell with child mode and parent/admin mode.
- Local configuration for SQLite path.
- Development seed command.

Acceptance checks:

- App starts locally.
- Child and parent/admin routes render.
- App can run without API keys.

### 2. SQLite And Migrations

Build:

- Migration runner.
- `0001_initial_schema.sql`.
- `0002_seed_words.sql`.
- Data access helpers.

Use [Data Model](data-model.md) as the source of truth.

Use [UI Implementation Plan](ui-implementation-plan.md) for route and screen boundaries.

Acceptance checks:

- Migrations run once and record rows in `schema_migrations`.
- Foreign keys are enabled.
- Seed data creates one learner and loads the enriched MVP seed pack from [mvp-seed-vocabulary.json](../data/vocabulary/mvp-seed-vocabulary.json).
- Re-running setup does not duplicate seed words.

### 3. Canonical Word Admin

Build:

- Add word form.
- Batch paste flow.
- Edit word details.
- Fields for definition, example, synonym, antonym, spelling note, confusable word, and difficulty.

Acceptance checks:

- Parent can add one complete word.
- Parent can paste at least 5 words.
- Incomplete words are clearly shown as needing canonical content.
- Archived words do not appear in child sessions.

### 4. Learning Engine

Build:

- Pure TypeScript mastery engine.
- Recall decay calculation.
- Priority scoring.
- Session pool selection.
- Mastery colour updates.
- Attempt-to-state update logic.

Use [Mastery Scoring And Session Selection](mastery-scoring-and-session-selection.md) as the source of truth.

Acceptance checks:

- Unit tests cover recall decay.
- Unit tests cover colour mapping.
- Unit tests prove weak spelling blocks green mastery.
- Unit tests prove recently failed words outrank stable green words.
- Unit tests prove heavy-hint correct answers improve mastery less than unassisted correct answers.

### 5. Question Generation

Build deterministic question generation for:

- Definition choice.
- Synonym choice.
- Antonym choice.
- Sentence usage choice.
- Fill sentence.
- Confusable choice.
- Spelling choice.
- Type from memory.

Acceptance checks:

- Each generated question has one deterministic expected answer.
- Distractors never include duplicate answer text.
- Spelling questions compare submitted text case-insensitively but preserve canonical spelling in feedback.
- Question generation fails closed if canonical content is missing.

### 6. Child Daily Mission

Build:

- Daily mission route.
- 12 to 20 question session.
- Progress indicator.
- Hint button using deterministic hints.
- Attempt recording.
- End-of-session summary.
- Cached avatar/background visuals.

Acceptance checks:

- Child can complete a session without parent/admin controls visible.
- Every question creates one `practice_attempts` row.
- Completing the session updates `practice_sessions.status` to `completed`.
- End screen shows words improved, spelling traps, and words to revisit.
- Session runs without network access.

### 7. Parent Dashboard

Build:

- Current mastery overview.
- Red/orange word list.
- Repeated spelling mistakes.
- Forgotten-after-delay list.
- Recent session summary.

Acceptance checks:

- Dashboard reads from saved attempts, not mocked UI state.
- Dashboard distinguishes meaning, usage, and spelling weakness.
- Dashboard shows at least one suggested focus for the next session.

## Phase 1B Build Sequence

### 1. LLM Provider Abstraction

Build:

- Provider interface.
- Prompt versioning.
- Request/response logging.
- Timeout and retry policy.
- Disabled/offline mode.

Acceptance checks:

- App can run with LLM disabled.
- Provider errors do not break child sessions.
- Provider responses are stored only in generated-content tables.

### 2. Prompt Templates

Build prompt templates for:

- Hint ladders.
- Wrong-answer explanations.
- Fresh example sentences.
- Confusable-word comparisons.
- Memory tricks.
- Future image prompts.

Acceptance checks:

- Prompt inputs include canonical word data.
- Prompt inputs include only broad learner interests and relevant learning history.
- Prompt inputs do not include sensitive personal details.
- Prompt outputs are parsed into structured fields.
- Invalid output is rejected and not shown to the child.

### 3. Generated Content Review

Build:

- `draft`, `approved`, `rejected`, `disabled` review states.
- Parent/admin preview.
- Approve/reject/regenerate controls.
- Child flow that only uses approved generated content.

Acceptance checks:

- Draft generated content never appears in the child flow.
- Rejected and disabled content never appears in the child flow.
- Regenerating creates a new row rather than mutating approved history silently.
- Parent/admin can see provider, model, prompt version, and created time.

### 4. AI Tutor Integration

Build:

- Hint retrieval from approved generated hints.
- Fallback to deterministic hint ladder.
- Wrong-answer explanation display.
- Confusable-word comparison display.

Acceptance checks:

- Hints do not reveal the answer before the configured reveal step.
- A correct answer after a heavy hint counts less than an unassisted correct answer.
- Wrong-answer explanations cannot change deterministic marking.
- If generation fails, the child still receives deterministic help.

## AI Safety Engineering Checks

These checks are required before MVP-1B is accepted.

Prompt constraints:

- Use British English.
- Use Year 5-appropriate wording.
- Explain only the current approved word or current approved confusable pair.
- Do not ask the child for personal information.
- Do not mention real school application outcomes.
- Do not create a free-form conversation.
- Do not reveal the answer before the final reveal hint.
- Do not override canonical definitions or accepted answers.

Blocked behaviours:

- Free-form chatbot interface for the child.
- AI marking correctness.
- AI changing mastery state.
- AI creating or editing canonical definitions without parent/admin approval.
- Prompting for full name, address, school, photos, or sensitive details.
- Realistic child likeness generation.
- Unapproved generated content appearing in child sessions.

Logging requirements:

- Store provider, model, prompt version, generated-content type, status, and timestamps.
- Store sanitized `input_context_json`.
- Do not store private diary-like child details.
- Keep enough information for parent/admin debugging and prompt iteration.

Fallback requirements:

- If LLM generation times out, use deterministic hints.
- If LLM output fails validation, reject it and use deterministic hints.
- If no approved generated content exists, use deterministic hints.
- If provider config is missing, run MVP-1A behaviour.

## Verification Before Coding Phase Is Complete

MVP-1A verification:

- Unit tests pass for learning engine.
- Schema migration test passes on an empty SQLite database.
- Seed data loads successfully.
- Manual smoke test completes one child session.
- Parent dashboard reflects that session.
- App runs with no API keys.

MVP-1B verification:

- Prompt builder tests prove sensitive fields are excluded.
- Generated content validation tests reject malformed output.
- Child flow uses only approved generated content.
- Provider failure test falls back to deterministic hints.
- Wrong-answer explanation test proves deterministic marking is unchanged.

## Implementation Stop Conditions

Pause and re-scope if:

- The first playable build requires LLM access to work.
- The learning engine cannot be unit-tested separately from the UI.
- Generated content has no review state.
- The child UI exposes parent/admin controls.
- A word can become green while one mastery dimension is still weak.
- AI output can directly change correctness, scheduling, or mastery colour.
