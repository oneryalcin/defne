# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-07-22
- Primary product surfaces: Parent dashboard, parent vocabulary and spelling libraries, child vocabulary and spelling practice.
- Evidence reviewed: `AGENTS.md`, `README.md`, `docs/design-system.md`, the parent vocabulary, spelling, and dashboard screenshots supplied on 2026-07-19, `src/app/parent/page.tsx`, `src/app/parent/words/page.tsx`, `src/app/parent/spelling/page.tsx`, `src/components/WordHeatmap.tsx`, `src/components/SpellingHeatmap.tsx`, `src/components/ProgressDistribution.tsx`, `src/components/parent/ParentVocabularyList.tsx`, `src/components/parent/ParentSpellingList.tsx`, `src/app/globals.css`, and `src/app/design-system.css`.

## Brand
- Personality: Calm, editorial, warm, and practical; a well-lit study room rather than a game.
- Trust signals: Visible learning evidence, deterministic status labels, inspectable history, and parent controls beside the affected word.
- Avoid: Score pressure, streak mechanics, harsh failure language, decorative dashboards, colour-only meaning, and new visual systems that compete with the mastery palette.

## Product goals
- Goals: Help a parent see which vocabulary and spellings need attention, understand why, and place a word into the next useful practice round quickly.
- Non-goals: Ranking children, awarding points, turning progress into a grade, or hiding learning state behind aggregate charts.
- Success signals: A parent can identify weak spelling items at a glance, filter to one spelling state, and request the next round without opening each item.

## Personas and jobs
- Primary personas: A parent managing practice; a Year 5 child completing calm, focused rounds.
- User jobs: Parent reviews the whole deck, finds weak or untried items, fixes content, and adjusts the next round. Child sees supportive progress without performance pressure.
- Key contexts of use: Parent laptop for dense review; tablet or phone for child practice.

## Information architecture
- Primary navigation: Parent, Vocabulary, Spelling; Child, Vocabulary, Spellings.
- Core routes/screens: `/parent`, `/parent/words`, `/parent/spelling`, `/child`, `/child/words`, `/child/spelling/words`.
- Content hierarchy: Parent overview first, then actionable lists; on each library page, learner selection and round controls precede search/filter, assigned items, and the shared library.

## Design principles
- Evidence before decoration: Every progress view must expose labelled states and useful attempt evidence.
- Parity across learning modes: Vocabulary and spelling may use different deterministic status rules, but equivalent parent tasks should have equivalent controls and overview density.
- Calm actionability: Put “Next round”, edit, and assignment controls next to the status they affect.
- Tradeoffs: Parent screens favour density and scan speed; child screens favour space and one clear task.

## Visual language
- Color: Use the existing red, orange, yellow, light-green, and green mastery tokens. Pair every colour with a text label; use the muted neutral token for not started.
- Typography: Reuse current display, body, editorial, and mono tokens. Editorial italic is for word names and section accents, not controls.
- Spacing/layout rhythm: Grid-first, compact parent rows, generous section gaps, and the existing 1280px parent container.
- Shape/radius/elevation: Reuse existing cards, pills, dashed secondary buttons, and heatmap cells.
- Motion: Minimal hover/focus lift only; respect reduced motion.
- Imagery/iconography: Pencil and laurel motifs remain supporting accents. No image is needed for dense progress views.

## Components
- Existing components to reuse: `ProgressDistribution`, `WordHeatmap`, `SpellingHeatmap`, `MasteryBadge`, parent word rows, buttons, fields, and pagination.
- New/changed components: Parent spelling rows gain a labelled spelling-status pill and status filter; spelling heatmaps become available on parent spelling and dashboard surfaces. Both child previews explain why Defne selected a round and offer the same strict, one-round colour focus without replacing the guided plan.
- Variants and states: Not tried, Needs another look, Practising, Spotted once, Reliable, Steady spelling; all states include a dot, label, and accessible control text.
- Token/component ownership: Semantic status labels and fills live in `ProgressDistribution.tsx`; page-specific layout stays in parent components and existing CSS files.

## Accessibility
- Target standard: WCAG 2.2 AA where practical for the pilot.
- Keyboard/focus behavior: Filters are labelled native controls; heatmap cells and links remain keyboard focusable; actions keep visible focus states.
- Contrast/readability: Colour is never the only signal. Status pills include text and heatmap legends name every colour.
- Screen-reader semantics: Filters have explicit labels; heatmaps use list semantics and descriptive labels; pagination retains named navigation.
- Reduced motion and sensory considerations: No flashing or celebratory motion; existing hover transitions should be removed under reduced-motion preferences.

## Responsive behavior
- Supported breakpoints/devices: 375px, 768px, 1024px, and 1440px.
- Layout adaptations: Parent two-column word rows collapse to one column; control groups wrap; heatmap auto-fill columns shrink without horizontal scrolling.
- Touch/hover differences: Controls keep at least 44px targets. Heatmap status remains visible through labels/legend even when hover tooltips are unavailable.

## Interaction states
- Loading: Server-rendered pages use the current route-level behavior; do not add circular spinners.
- Empty: Explain whether no assigned items exist or no items match the active search/status filter.
- Error: Preserve server action error handling and use calm language.
- Success: After a next-round action, show the existing undo state beside the item.
- Disabled: Pagination uses its current disabled semantics; filters remain usable with zero results. During an active child round, focus choices remain visible but disabled with an "Available after this round" explanation. A separate, two-step escape hatch may end the round and start a chosen replacement; it must explain that prior answers remain in learning history.
- Offline/slow network, if applicable: Core data remains local SQLite; client-side search and status filtering work without a request after page load.

## Content voice
- Tone: Calm, direct, descriptive, and non-judgmental.
- Terminology: Use the established spelling labels exactly: Not tried, Needs another look, Practising, Spotted once, Reliable, Steady spelling.
- Microcopy rules: Describe evidence and next action. Avoid “failed”, grades, and unexplained numeric scores. State separately what a progress colour means and why a word is scheduled now. A child-selected colour must say clearly that no other colour will be added to fill the round.

## Implementation constraints
- Framework/styling system: Next.js App Router, React, TypeScript, SQLite, `globals.css`, and `design-system.css`.
- Design-token constraints: Reuse existing semantic CSS variables and status mappings; add no dependency or parallel token layer.
- Performance constraints: Classify and filter the already-loaded assigned list in memory; keep paginated heatmaps for large decks.
- Compatibility constraints: Preserve per-learner query parameters and existing server actions.
- Test/screenshot expectations: Run unit tests, typecheck, and production build; smoke-test the parent spelling list and dashboard at desktop and narrow widths.

## Open questions
- [ ] Should parent spelling progress eventually use the persisted learner spelling mastery state rather than the current transparent attempt-count buckets? Product owner / changes the meaning of historical status colours.
