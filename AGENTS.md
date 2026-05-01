# Defne App Agent Guide

This repo is a local-first vocabulary practice app for a parent and child pilot.
The first priority is durable learning value: meaning, spelling, recall, and
mistake recovery. Engagement should increase useful learning time, not become a
distraction loop.

## Engineering Principles

- Keep deterministic learning behaviour separate from AI-generated content.
- Treat SQLite as the source of truth from day one.
- Prefer simple, inspectable algorithms over clever opaque scoring.
- Do not let visual polish hide weak pedagogy or weak data quality.
- Keep child-facing flows calm, fast, and forgiving.
- Keep parent-facing flows efficient for adding, correcting, and reviewing words.
- Generated hints, examples, and images must remain reviewable before becoming
  trusted learning material.

## Implementation Notes

- Core learning logic belongs under `src/lib/learning`.
- Database access belongs under `src/lib/db`.
- Seed vocabulary data belongs under `data/vocabulary`.
- Route handlers and server actions should stay thin; put reusable behaviour in
  library modules.
- Avoid introducing external services into the MVP path unless the fallback path
  remains usable without them.

## Verification

Run these before committing meaningful changes:

```bash
npm run test
npm run typecheck
npm run build
```

For UI changes, also run the app locally and smoke-test the child mission and
parent dashboard:

```bash
npm run db:setup
npm run dev -- --port 3000
```

## Git Hygiene

- Keep commits focused and explain the learning/product impact in the message.
- Do not commit local SQLite runtime files such as `data/dev.sqlite`.
- Do not rewrite user work or reset the repo unless explicitly asked.
