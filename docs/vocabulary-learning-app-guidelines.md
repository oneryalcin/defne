# Vocabulary Learning App Guidelines

## Purpose

Build a vocabulary practice app for a Year 5 child preparing for Kendrick School / GL-style English vocabulary demands. The app should help her learn word meaning, usage, and spelling in a way that is efficient, memorable, and genuinely enjoyable.

The product should not be a generic flashcard app. It should behave like a serious spaced-repetition tutor underneath, while feeling like a lightweight game on the surface.

## Core Learning Problem

Simple synonym / antonym cards are not enough. A child can memorise a pair such as `reluctant = unwilling` and still fail to recognise or use the word correctly in a real sentence.

The app must train three connected abilities:

1. Meaning: understand what the word means.
2. Usage: recognise where the word fits in context.
3. Spelling: produce the word accurately from memory.

The app should make words stick through repeated retrieval, varied contexts, visual association, and targeted support when the child gets stuck.

## Exam Context And Boundaries

The app is vocabulary-focused. It is not trying to reproduce the whole GL Assessment or Kendrick entrance exam.

Relevant constraints:

- Focus on vocabulary, comprehension-adjacent word meaning, spelling, and usage.
- Prefer multiple-choice and short-answer formats because they match much of the exam-practice style.
- Do not copy protected GL Assessment questions or published commercial practice material.
- Do not over-index on creative writing, because Kendrick has stated that its entrance test does not include a creative writing element.
- Use exam-style discipline without making the product feel like a stressful test simulator.

The app should improve the vocabulary skills that help with GL-style English and verbal reasoning, while remaining a general-purpose vocabulary mastery tool.

## Product Principles

- Context beats isolated definitions.
- Retrieval beats rereading.
- Short, frequent sessions beat long cramming.
- Mistakes are diagnostic signals, not just wrong answers.
- Mastery must be proven across time, not only inside one session.
- The app should reward progress from weak to strong, not only perfect scores.
- AI should support hints and enrichment, but deterministic code should own correctness and mastery.

## Pilot-First UX Frame

The first version is for one parent and one child. It should be judged by whether it improves learning and creates healthy, focused practice time, not by whether it is ready for a broad public launch.

The highest-priority UX questions are:

- Does the child understand the word better after repeated contextual practice?
- Does the child remember the word after a delay?
- Does spelling improve for known traps?
- Does the child want to complete short learning missions without the experience becoming stressful or social-media-like?
- Can the parent quickly see what to practise next?

Lower-priority for the pilot:

- Polished onboarding for unknown users.
- Full accessibility compliance.
- Multi-family account flows.
- Commercial packaging.
- Fully general parent workflows.

These lower-priority items become important if the pilot proves the idea and the app moves towards a real product for other children.

## User Experience Goal

The child should want to come back because the app feels active, visual, and rewarding. The parent should be able to add difficult words quickly and see whether the words are actually becoming stable.

The inspiration from Times Tables Rock Stars is useful: weak items start red and gradually move towards green as the child proves mastery. The same concept should apply to vocabulary words.

## Mastery Colours

Each word should have a mastery state:

- Red: new or frequently missed.
- Orange: partially known.
- Yellow: mostly known but unstable.
- Light green: reliable.
- Green: mastered.

The colour should be based on recent performance, delayed recall, speed, and failure type. A word should not become green after a few correct answers in one sitting. It should become green only after successful recall across time.

If a green word is missed after a delay, it should drop back to yellow or orange.

## Practice Batch Design

A daily session should use small batches rather than the whole word list.

A good session mix:

- 5 new or red words.
- 10 review words.
- 5 almost-mastered words.
- A few older green words for maintenance.

Weak words should appear more often. Strong words should appear less often but still return later to prevent forgetting.

The numbers above describe the visible session mix, not the full selection algorithm. Word selection should be driven by decay-based priority scoring across meaning, usage, and spelling mastery. See [Mastery Scoring And Session Selection](mastery-scoring-and-session-selection.md).

## Exercise Types

The app should rotate through varied question types so the child does not merely memorise one clue.

Meaning exercises:

- Choose the best definition.
- Choose the closest synonym.
- Choose the opposite meaning.
- Match word to meaning.
- Identify the word from a short clue.

Context exercises:

- Choose the sentence where the word is used correctly.
- Fill the word into a sentence.
- Pick which word best fits a sentence.
- Explain why one answer is better than a close distractor.

Confusable-word exercises:

- Choose between words she commonly mixes up.
- Compare near meanings, such as `reluctant` vs `anxious`.
- Show why a tempting answer is close but not correct.

Spelling exercises:

- Spot the incorrect spelling.
- Type the word from memory.
- Complete missing letters.
- Break the word into chunks.
- Highlight the tricky part of the spelling.

Production exercises:

- Type the word after seeing a definition.
- Complete a sentence without multiple-choice options.
- Say or type a simple sentence using the word.

## Failure Diagnosis

When the child misses a word, the app should record why. This is one of the most important parts of the learning engine.

Possible failure types:

- Did not know the meaning.
- Confused it with a similar word.
- Understood the meaning but chose the wrong spelling.
- Recognised the word but could not produce it.
- Answered too slowly.
- Guessed.
- Forgot it after a delay.

Each failure type should trigger a different next practice step.

Examples:

- Meaning failure: show contextual examples and ask a simpler meaning question.
- Confusion failure: compare the target word with the confused word.
- Spelling failure: highlight the exact mistake and retest later.
- Production failure: give partial letters, then ask again later without support.

## Hint Ladder

Hints should be progressive. The app should not reveal the answer too early.

Example for `reluctant`:

1. Tiny clue: "This describes someone who does not really want to do something."
2. Context clue: "In the sentence, the girl pauses before entering. What feeling does that suggest?"
3. Contrast clue: "It is the opposite of eager."
4. Near-word comparison: "It is close to hesitant, but often means unwilling."
5. Memory trick: "Think: she is holding back."
6. Spelling clue: "It starts with `reluc-` and ends with `-tant`."
7. Answer reveal with explanation.

Hints should be tracked. If a child answers correctly only after heavy hints, the word should not move up as strongly as an unassisted correct answer.

## Word Families

The app should teach related word forms so the child can generalise.

Examples:

- `hesitate`, `hesitant`, `hesitation`
- `reluctant`, `reluctance`
- `fragile`, `fragility`
- `observe`, `observation`, `observant`

Word-family knowledge helps with GL-style vocabulary because the child may meet a related form rather than the exact word she practised.

## Confusable Words

The app should explicitly train near words that children often mix up.

Examples:

- `reluctant` vs `anxious`
- `cautious` vs `cowardly`
- `generous` vs `grateful`
- `observe` vs `notice`
- `peculiar` vs `particular`
- `fragile` vs `frail`

This is more useful than showing random synonyms, because it attacks the exact boundary where understanding is weak.

## Spelling Strategy

Spelling should be taught through targeted recall, not copying the word repeatedly.

Good spelling flow:

1. Show the word in a sentence.
2. Show or play the word.
3. Hide the word.
4. Ask the child to type it.
5. If wrong, highlight the difference.
6. Retest later after other questions.

Example:

`seperate` -> `separate`

The app should show that the mistake is the middle vowel, not simply mark the whole word wrong.

For tricky words, store spelling notes:

- `accommodation`: double `c`, double `m`.
- `necessary`: one `c`, double `s`.
- `separate`: has `par` in the middle.

## Visual Hints And Memory Anchors

Generated images can be powerful if they encode the meaning of the word. They should not just decorate the app.

For `reluctant`, a useful image might show a child standing at the edge of a swimming pool, leaning back and not wanting to jump. The visual clue anchors "unwilling / hesitant".

For `fragile`, a useful image might show a delicate glass ornament balanced on a shelf.

For `cautious`, a useful image might show a child crossing icy stepping stones carefully.

Rules for visual hints:

- The image should represent the meaning, not the spelling.
- Do not rely on generated images to render text accurately.
- Render the actual word and spelling hints in normal app UI.
- Reuse the same memory image enough times for association to stick.
- Allow parent/admin review or regeneration of images.

## Story Character And Visual Continuity

The app should consider a recurring child character who follows the learner through the vocabulary journey. This can make the product feel less like a quiz app and more like a personal story.

The character could be a stylised pencil-drawing avatar: a girl with broad, parent-controlled visual traits, not a photorealistic copy of the child. The safest default is to create a fictional-but-familiar learner avatar rather than using real photos.

The character should appear in:

- Word memory scenes.
- Hint illustrations.
- Mission maps.
- End-of-session celebrations.
- Tricky-word recovery moments.
- Progress summaries.

The character can reference learning history in a lightweight way:

- "You rescued `reluctant` yesterday."
- "This spelling trap came back, so let us slow it down."
- "You moved three orange words closer to green."
- "This word is tricky because you often confuse it with `anxious`."

This makes the app feel adaptive without needing a free-form chatbot. The character should remember learning events, not private personal details.

Visual continuity matters. If every generated image looks unrelated, it weakens the memory effect. The app should keep a consistent illustration style, recurring avatar, colour language, and world/map structure.

Practical approach:

- MVP-1A: use a small library of cached standard avatar poses and backgrounds.
- MVP-1B: use AI to generate word-specific scene prompts featuring the same stylised character.
- Phase 2: add parent-approved generated visual mnemonic cards for difficult words.

Generated images should support retrieval. They should help the child remember what a word means, why she missed it, or how she improved.

## AI Role

The deterministic app should own:

- Canonical word spelling.
- Accepted definitions.
- Correct answers.
- Scoring.
- Mastery level.
- Spaced repetition scheduling.
- Parent-approved content.

The LLM should help with:

- Adaptive hints.
- Fresh example sentences.
- Child-friendly explanations.
- Near-word comparisons.
- Memory tricks.
- Image prompts.
- Personalised contexts based on interests.

The image model should help with:

- Visual mnemonic cards.
- Backgrounds or scenes tied to a word's meaning.
- Consistent visual themes for missions or worlds.

The AI should not be the source of truth for marking answers.

## AI Safety And Privacy

Because this is for a child, AI usage should be deliberately bounded.

Rules:

- Do not require the child's full name, school, address, or sensitive personal details.
- Store interests as broad preferences, such as "gymnastics", "books", or "space", not private biographical data.
- Do not upload or use real photos of the child for generated images unless there is a separate explicit parent decision later.
- Prefer a stylised fictional avatar over a realistic likeness.
- Keep generated examples age-appropriate, calm, and educational.
- Cache useful generated hints and images so the learning experience is stable.
- Allow parent/admin review for generated content, especially images.
- Make provider choice pluggable so the app can switch between OpenAI, Gemini/Nano Banana, or another image model later.

The safest default is that AI generates learning support around approved words; it does not chat freely with the child.

Engineering checks before child-facing AI is enabled:

- Generated content must have `draft`, `approved`, `rejected`, or `disabled` status.
- Only approved generated content can appear in the child flow.
- Prompt inputs must exclude full name, address, school, real photos, and sensitive personal details.
- Prompt inputs may include canonical word data, broad interests, recent learning history, failure type, and confusable words.
- If generation fails, times out, or returns invalid structure, the app must fall back to deterministic hints.
- LLM output must never directly mark answers, update mastery, or change scheduling.
- Hint validation must prevent answer leakage before the final reveal step.
- Parent/admin must be able to inspect generated content metadata: provider, model, prompt version, status, and created time.

Detailed implementation checks are captured in [Implementation Plan](implementation-plan.md).

## Content Quality Rules

Every word should have high-quality canonical content before optional AI enrichment.

Minimum canonical content:

- Correct British English spelling.
- Short child-friendly definition.
- One or more example sentences.
- At least one synonym or near synonym where appropriate.
- At least one antonym or contrast where appropriate.
- Spelling note if the word is likely to be misspelled.
- Difficulty level.
- Optional confusable words.

Generated content should be labelled separately from canonical content and can be reviewed, regenerated, or disabled.

## Personalisation

The app can become much stronger if it knows what the child likes and what she struggles with.

Examples:

- If she likes gymnastics, generate sentences about competitions, balance beams, and practice.
- If she likes stories, make word missions around a reading adventure.
- If she repeatedly confuses two words, the app should generate a custom comparison.
- If she misses the same spelling pattern, the app should focus on that pattern.

Personalisation should be useful but controlled. Generated content should be cached and reused when it works.

## Game Layer

Coins alone may not be the right reward for a Year 5 child, but progress, unlocks, and status can still work.

Possible game elements:

- A journey map.
- Daily missions.
- Mastery badges.
- Unlockable themes.
- Word worlds or regions.
- "Move 3 words from orange to yellow" achievements.
- Streaks that reward consistency without punishing missed days too harshly.

The game layer should reward effort and learning movement:

- "You rescued 4 red words."
- "3 spelling traps improved."
- "2 old green words stayed strong."

This is better than only showing a percentage score.

## Parent/Admin Experience

The parent workflow must be fast, otherwise the app will not be maintained.

Parent/admin should be able to:

- Add a word manually.
- Paste a list of words.
- Import CSV.
- Mark a word as "struggled today".
- Add a custom sentence or note.
- See weak words.
- See decaying words.
- See spelling traps.
- Review AI-generated examples and images.

The parent dashboard should answer:

- Which words are still red/orange?
- Which words are improving?
- Which words were forgotten after delay?
- Which spelling mistakes repeat?
- What should she practise today?

## Child Session Flow

A good daily session should last around 10 to 15 minutes.

Suggested flow:

1. Warm-up with familiar words.
2. Introduce or revisit a few red words.
3. Play mixed mini-games.
4. Give targeted hints when stuck.
5. Include at least one spelling production task.
6. End with a progress summary.

The end screen should focus on movement:

- Words improved.
- Tricky spellings fixed.
- Words that need another try tomorrow.
- New visual cards unlocked.

## British English And Age Fit

The app should use British English spelling, vocabulary, and school context.

Examples:

- `favourite`, not `favorite`.
- `practise` as a verb, `practice` as a noun.
- UK school examples where relevant.

Content should feel appropriate for a Year 5 child: not babyish, not adult, and not exam-panicky.

## MVP And Roadmap

The detailed MVP boundary is captured in [MVP Scope](mvp-scope.md).

The phased product plan is captured in [Product Roadmap](product-roadmap.md).

The SQLite schema is captured in [Data Model](data-model.md).

The build sequence and acceptance checks are captured in [Implementation Plan](implementation-plan.md).

The screen-level UI plan is captured in [UI Implementation Plan](ui-implementation-plan.md).

The family-pilot UX evaluation frame is captured in [Pilot UX Research Frame](pilot-ux-research-frame.md).

Reusable image-generation prompts for mockups and visual direction are captured in [Visual Concept Prompts](visual-concept-prompts.md).

## Earlier Milestone Notes

MVP-1A should be deterministic and useful without AI:

- Word list.
- Definitions.
- Example sentences.
- Synonyms and antonyms.
- Spelling notes.
- Multiple exercise types.
- Mastery colours.
- Basic spaced repetition.
- Parent add/edit flow.
- Child daily practice flow.

MVP-1B can add LLM tutoring:

- Hint generation.
- Extra examples.
- Confusable-word explanations.
- Personalised mini-stories.
- Mistake-specific explanations.

Phase 2 can add image generation:

- Visual mnemonic cards.
- Word-themed backgrounds.
- Mission scenes.
- Parent approval/regeneration.

## Engineering Boundaries

Keep the learning engine deterministic and testable.

Core entities likely include:

- `Word`
- `WordFamily`
- `Definition`
- `ExampleSentence`
- `Synonym`
- `Antonym`
- `ConfusableWord`
- `SpellingNote`
- `PracticeAttempt`
- `FailureType`
- `MasteryState`
- `ReviewSchedule`
- `GeneratedHint`
- `GeneratedImage`

Important engineering rule: generated content should be stored separately from canonical content and marked as generated/reviewed.

## Success Criteria

The app is working if:

- The child voluntarily returns to practise.
- Red/orange words move towards green over days and weeks.
- Spelling mistakes reduce for known traps.
- She can recognise words in new sentences.
- She can produce difficult words from definitions or contexts.
- Parent can add and monitor words without friction.
- AI hints help without making the app feel random or unreliable.

## Core Product Sentence

This app helps a child master difficult vocabulary through contextual retrieval, spelling practice, adaptive repetition, targeted hints, and memorable visual anchors.
