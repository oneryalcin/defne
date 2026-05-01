# Defne Vocabulary

Local-first vocabulary practice app for the family pilot.

## Current Scope

This is MVP-1A:

- deterministic vocabulary missions
- round-based learn-card, meaning, and context practice
- SQLite persistence
- seed vocabulary import
- separate meaning, usage, and spelling mastery
- decay-based session selection
- parent dashboard and word entry
- no LLM, no network dependency, no generated child-facing content

## Local Commands

```bash
npm install
npm run db:setup
npm run dev
```

Then open `http://localhost:3000`.

Verification:

```bash
npm run test
npm run typecheck
npm run build
```

The default SQLite path is `data/dev.sqlite`. Override it with `DEFNE_DB_PATH` when needed.
