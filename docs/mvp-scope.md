# MVP Scope

## MVP Sentence

A child plays short vocabulary missions where difficult words become memorable through context, spelling recall, adaptive repetition, hints, and a recurring visual story character, while the parent controls the word list and sees what is actually sticking.

## Product Shape

The MVP is a hybrid vocabulary learning game:

- Traditional deterministic learning engine for correctness, scoring, mastery, and scheduling.
- LLM-assisted tutoring for hints, explanations, examples, and confusable-word support.
- Lightweight visual story layer with a recurring stylised avatar and cached standard scenes.
- SQLite-backed local data from the beginning.

The MVP should feel like a daily adventure, not a dry quiz app.

## Pilot Scope

The first build is a two-user family pilot: one parent and one child. It is not trying to be a polished public product yet.

For the pilot, optimise for:

- Pedagogical value: does the child actually learn, retain, and use difficult words better?
- Effective engagement: does the child willingly spend focused learning time in the app?
- Parent observability: can the parent see what is sticking and what needs attention?
- Fast iteration: can the parent adjust words, hints, and examples based on real use?

Do not optimise the pilot for:

- Broad onboarding for unknown families.
- Public accessibility compliance.
- Classroom/account management.
- Payment, subscriptions, marketing, or polished product operations.
- Fully self-serve content workflows for many parents.

Accessibility and parent-burden concerns should be treated as future productisation risks unless they directly block the pilot users. The pilot should still avoid obvious avoidable problems, but it should not delay the core learning loop for broad-market polish.

The MVP is delivered in two milestones:

- MVP-1A: deterministic playable core. This is the first playable build and must not depend on LLM or image generation.
- MVP-1B: bounded AI tutor. This completes the hybrid MVP by adding LLM-generated hints, explanations, and examples behind strict controls.

Do not start full visual image generation, puzzle modes, accounts, or productisation until MVP-1A is working and MVP-1B is scoped behind the deterministic learning engine.

## Primary Users

Child learner:

- Year 5 level.
- Preparing vocabulary skills useful for Kendrick / GL-style English.
- Needs repetition, context, spelling support, and motivation.

Parent/admin:

- Adds difficult words.
- Reviews progress.
- Controls generated content.
- Wants evidence that words are sticking over time.

## Child Experience

The child should:

- Open a daily mission rather than a generic test screen.
- Practise around 15 to 20 words per session.
- See words move through red, orange, yellow, light green, and green.
- Get mixed exercises across meaning, sentence usage, confusables, spelling, and production.
- Ask for progressive hints when stuck.
- See a recurring pencil-drawing style avatar across the journey.
- Receive an end-of-session summary focused on progress and effort.

End-of-session examples:

- "You rescued 4 red words."
- "2 spelling traps improved."
- "3 orange words moved closer to green."
- "`reluctant` needs another try tomorrow."

## Parent/Admin Experience

The parent should be able to:

- Add a word manually.
- Paste a batch of words.
- Edit canonical definition, spelling note, example sentence, synonyms, antonyms, and confusables.
- Mark a word as "struggled today".
- See current mastery colours.
- See repeated spelling mistakes.
- See words that were forgotten after delay.
- Review generated hints and examples.
- See generated image prompts and future image approval state.

CSV import is useful but can be a fast-follow if manual and paste flows are good.

## Core Learning Features

MVP must include:

- Separate mastery tracking for meaning, usage, and spelling.
- Decay-based session selection.
- Colour-based mastery states.
- Practice attempts stored with question type, correctness, hint level, and response time.
- Failure diagnosis at least at a coarse level.
- Deterministic scoring and scheduling.
- Daily mission session structure.

See [Learning Selection Algorithm](learning-selection-algorithm.md) for the
current word selection algorithm.
See [Round-Based Vocabulary Mode](round-based-vocabulary-mode.md) for the batch
learning flow: learn cards, definition recognition, sentence-context use, retry
of missed words, and first-attempt versus eventually-correct scoring.

## Exercise Types In MVP

Include these exercise types first:

- Choose best definition.
- Choose closest synonym.
- Choose opposite meaning.
- Choose correct sentence usage.
- Fill a word into a sentence.
- Choose between confusable words.
- Spot incorrect spelling.
- Type the word from memory.

The initial child mission may present these as a mixed daily mission or as a
round-based vocabulary mission. In the round-based version, Step 2 tests
definition recognition and Step 3 tests sentence-context usage. A child may retry
missed words until all are eventually correct, but first-attempt mistakes still
feed the mastery and scheduling engine.

Do not build full crosswords or large puzzle modes in MVP. They belong in the roadmap.

## LLM Features In MVP-1B

The hybrid MVP should include bounded LLM support, because adaptive tutoring is part of the product value. This belongs in MVP-1B, after MVP-1A proves the deterministic session loop.

LLM can generate:

- Progressive hint ladders.
- Wrong-answer explanations.
- Fresh child-friendly example sentences.
- Confusable-word comparisons.
- Memory tricks.
- Image prompts for future visual cards.

LLM should use:

- Canonical word data.
- Broad learner interests.
- Recent learning history.
- Known failure types.
- Words the child often confuses.

LLM must not own:

- Correct spelling.
- Correct answer marking.
- Mastery colours.
- Spaced repetition scheduling.
- Canonical definitions.

No free-form child chatbot in MVP.

## Visual Features In MVP

Include lightweight visuals from day one:

- Recurring stylised pencil-drawing avatar.
- Cached standard avatar poses.
- Cached standard mission backgrounds.
- Mastery colours as strong visual feedback.
- Placeholder slot for each word's visual mnemonic card.
- Stored image prompt and approval state for future generated images.

Do not make full image generation required for the first playable release. The schema and UI should be ready for it, but the app should work without generated images.

## SQLite From Day One

Use SQLite from the start so learning history, generated content, and mastery state are durable.

The concrete schema, relationships, required fields, indexes, and migration approach are defined in [Data Model](data-model.md).

Generated content must be stored separately from canonical content and marked with status such as `draft`, `approved`, `rejected`, or `disabled`.

## Suggested Engineering Stack

Default stack:

- Next.js.
- React.
- TypeScript.
- SQLite.
- Deterministic learning engine as a pure TypeScript module.
- LLM provider abstraction in MVP-1B.
- Image provider abstraction later, with schema placeholders present from MVP-1A.

The first version should be local-first. Deployment, accounts, and multi-device sync can come later.

## Seed Content

The MVP should include 20 to 50 seed vocabulary words for development and demonstration.

Current seed files:

- Full raw backlog: [parent-vocabulary-backlog.json](../data/vocabulary/parent-vocabulary-backlog.json)
- Enriched MVP seed pack: [mvp-seed-vocabulary.json](../data/vocabulary/mvp-seed-vocabulary.json)

Each seed word should include:

- Word.
- British English spelling.
- Child-friendly definition.
- Example sentence.
- Synonym or near synonym.
- Antonym or contrast.
- Spelling note if relevant.
- Optional confusable word.
- Difficulty level.

## Deliberately Deferred

Do not include in MVP:

- Full crossword builder.
- Large puzzle system.
- School/classroom accounts.
- Payment or subscription.
- Mobile app packaging.
- Advanced image generation workflow.
- Photorealistic child avatar.
- Free-form AI chat.
- AI-based answer marking.
- Complex spaced-repetition research model.

These are useful later, but they should not block the first playable product.

## MVP-1A Acceptance Criteria

MVP-1A is successful if:

- The child can complete a daily mission of 12 to 20 questions without parent help.
- A seeded learner and 20 to 50 seed words can be loaded from SQLite.
- The parent can add one word manually with definition, example, spelling note, synonym, antonym, and optional confusable word.
- The parent can paste at least 5 words in one batch and then complete missing canonical fields.
- The app records every attempt with session, word, question type, correctness, hint level, response time, and failure type.
- At least 5 exercise types are playable: definition, synonym, sentence usage, confusable word, and type-from-memory spelling.
- Round-based sessions distinguish `first_attempt_correct` from `eventually_correct` when retries are allowed.
- Mastery colours update after attempts and use separate meaning, usage, and spelling mastery.
- A word with weak spelling cannot become green even if meaning questions are answered correctly.
- Session selection shows weak or due words before stable green words in a seeded deterministic test.
- The end screen shows at least words improved, spelling traps, and words to revisit tomorrow.
- Parent dashboard shows red/orange words, repeated spelling mistakes, forgotten-after-delay words, and latest session summary.
- The app works with cached avatar/background visuals and no network call.

## MVP-1B Acceptance Criteria

MVP-1B is successful if:

- The app can generate or retrieve a progressive hint ladder for an approved word.
- Hint levels do not reveal the answer before the configured reveal step.
- Wrong-answer explanations reference the canonical answer and do not override deterministic marking.
- Generated examples are stored with provider, prompt version, review status, and source word.
- Generation failures fall back to deterministic hints without breaking the session.
- Parent/admin can approve, reject, disable, or regenerate generated hints/examples.
- LLM prompts receive only canonical word data, broad interests, and learning history needed for the hint.
- The child never gets a free-form chatbot surface.
- Prompt and response logs are available for parent/admin debugging without storing sensitive personal details.
- The deterministic engine still controls scoring, scheduling, and mastery colours.

## First Playable Target: MVP-1A

The first playable build should demonstrate:

1. A seeded learner profile.
2. A small set of vocabulary words.
3. A child mission screen.
4. Several exercise types.
5. Deterministic hint ladder support.
6. Attempt recording in SQLite.
7. Mastery colour movement.
8. Parent/admin progress view.
9. Cached avatar/background visuals.
10. Generated-content tables present but unused by the child flow.

See [Implementation Plan](implementation-plan.md) for the build sequence and verification steps.

See [Pilot UX Research Frame](pilot-ux-research-frame.md) for how to evaluate the first parent/child pilot.
