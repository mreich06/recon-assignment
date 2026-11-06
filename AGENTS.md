# AGENTS.md

Guidance for AI coding agents working in this repo.

## What this is

A take-home exercise: a daily reconciliation tool. `README.md` has the brief and
`docs/DATA_SPEC.md` has the data formats.

## Layout

- `data/`: input exports. Treat them as read-only.
- `docs/`: the data spec and the golden examples.
- `starters/typescript/`: the implementation.

## Commands

Run these from `starters/typescript/`:

```bash
npm install
npm start -- run --date 2026-03-01   # run the tool
npm test                             # tests
npm run typecheck                    # tsc --noEmit
npm run format                       # prettier --write
npm run format:check                 # prettier --check
```

Before you finish a change, run `npm test`, `npm run typecheck` and `npm run format:check`.

## Conventions

- Don't add, remove or upgrade dependencies. Propose the change and wait for the user to review it.
- State between runs lives in a local JSON file. Re-running a date must be idempotent, with no new findings and no duplicated state.
- Run only read-only git commands.
