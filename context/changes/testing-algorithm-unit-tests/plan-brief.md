# Testing: Algorithm Unit Tests — Plan Brief

> Full plan: `context/changes/testing-algorithm-unit-tests/plan.md`
> Research: `context/changes/testing-algorithm-unit-tests/research.md`

## What & Why

Bootstrap Vitest and write 13 unit tests for `detectCarConflicts` — the pure conflict-detection function that is the product's core value. No tests exist anywhere in this codebase; this is the first rollout phase of `context/foundation/test-plan.md`. The goal is to lock the correctness of the algorithm (especially the touching-boundary PRD invariant) before any future change can silently regress it.

## Starting Point

No test runner is configured. `detectCarConflicts` at `src/lib/services/events.ts:14–37` is a pure synchronous function with zero external dependencies — directly importable by Vitest with no mocking infrastructure. Vite 7.3.3 is already present transitively via Astro.

## Desired End State

`npm run test` exits 0 with 13 named passing tests. A `vitest.config.ts` exists at the project root. The test file lives at `src/lib/services/events.test.ts`. CI integration is deferred to rollout Phase 3.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test runner | Vitest 3.x | Matches Vite 7 pin already in `package.json overrides`; Astro-native via `getViteConfig()` | Research |
| Config approach | `getViteConfig()` from `astro/config` | Handles `@/*` alias + `astro:env` virtual module automatically; avoids breaking config change when Phase 2 adds component tests | Research |
| Environment | `node` | Pure function tests need no DOM | Research |
| Test file location | `src/lib/services/events.test.ts` | Co-located with source per project `src/lib/` convention | Research |
| CI gate | Deferred to rollout Phase 3 | Test plan §3 explicitly reserves CI wiring for the security baseline phase | Test plan |
| Scope | `detectCarConflicts` only | Only pure functions testable without Supabase; everything else deferred to Phases 2–3 | Test plan §3 |

## Scope

**In scope:**
- `npm install -D vitest`
- `vitest.config.ts` at project root
- `test` + `test:watch` scripts in `package.json`
- `src/lib/services/events.test.ts` with 13 test cases

**Out of scope:**
- Component tests (`EventForm`, etc.) — rollout Phase 2
- Service-layer tests with Supabase mock — rollout Phase 2
- CI YAML changes — rollout Phase 3
- `lint-staged` / husky changes
- Any changes to `src/lib/services/events.ts`

## Architecture / Approach

Two phases in dependency order. Phase 1 is config-only: install Vitest, wire the config, add scripts. Phase 2 is additive: one new test file, no application code changes. The `makeEvent` factory in the test file satisfies TypeScript's full `EventWithProfiles` type while letting each test case override only the fields the algorithm reads (`car_needed`, `starts_at`, `duration_minutes`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Vitest Bootstrap | `npm run test` is a valid command; config resolves `@/*` alias | `getViteConfig()` API change between Astro versions — verify import path |
| 2. Unit Tests | 13 passing tests locking R1, R2, R6 failure modes | T6 (touching boundary) must use strict `<` assertion — easy to write as `>= 1` by mistake |

**Prerequisites:** None — no prior phases or external services required.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- `getViteConfig()` is available in the installed Astro version (`^6.3.1`) — research confirms this; verify on first run.
- `starts_at` storage format remains naive ISO strings (no `Z` suffix) — T12/T13 lock this assumption and will fail loudly if storage format changes.

## Success Criteria (Summary)

- `npm run test` exits 0 with 13 passing tests
- T6 output explicitly names the touching-boundary PRD invariant — visible in CI logs
- `npm run lint` and `npm run build` continue to pass
