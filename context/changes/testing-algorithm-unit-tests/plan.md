# Testing: Algorithm Unit Tests — Implementation Plan

## Overview

Bootstrap Vitest and write unit tests for `detectCarConflicts` — the pure conflict-detection function that is the core value of the product. No DB, no Supabase, no mocking: the function has zero external dependencies and can be tested directly. This is rollout Phase 1 from `context/foundation/test-plan.md`, covering risks R1 (false negative), R2 (false positive), and R6 (same-day filter assumption).

## Current State Analysis

- **No test runner** — `package.json` has no `vitest`, `jest`, or `playwright` in any dependency group. No `test` script exists.
- **Vite 7.3.3** is present transitively via Astro (`overrides.vite: "^7.3.2"`) — Vitest 3.x is the aligned choice.
- **`detectCarConflicts`** lives at `src/lib/services/events.ts:14–37`. Pure function, no imports beyond types. Directly importable in a Vitest test.
- **`@/*` path alias** — defined in `tsconfig.json:9-11`. `getViteConfig()` from `astro/config` resolves this automatically; no manual `resolve.alias` needed.
- **`verbatimModuleSyntax: true`** — tsconfig strict setting; type-only imports must use `import type`.

## Desired End State

`npm run test` runs cleanly, outputs 13 passing test cases covering all failure modes of `detectCarConflicts`, and exits 0. The test file lives at `src/lib/services/events.test.ts`. A `vitest.config.ts` exists at the project root. CI integration is deferred to rollout Phase 3 (per `context/foundation/test-plan.md` §3).

### Key Discoveries

- `detectCarConflicts(events: EventWithProfiles[]): ConflictPair[]` — pure, synchronous, no Supabase client (`src/lib/services/events.ts:14`)
- `car_needed` filter runs **first** on line 15 — before any date/time comparison
- Overlap: `aStart < bEnd && bStart < aEnd` — strict `<` on both sides; touching endpoints (end == start) are **not** conflicts (line 30)
- Same-day: `a.starts_at.slice(0, 10) !== b.starts_at.slice(0, 10)` on the raw naive ISO string (line 23) — compares user-typed calendar date prefix `YYYY-MM-DD` directly; no UTC conversion risk given current storage format
- `EventWithProfiles` extends `Event` with `subject` and `driver` joined profiles (`src/lib/services/events.ts:3–7`) — test fixtures must satisfy the full type, but the algorithm only reads `car_needed`, `starts_at`, `duration_minutes`
- Research confirmed R3's `updated_at` is already set manually in `updateEvent` (`src/lib/services/events.ts:127`) — that risk is handled; not in scope here

## What We're NOT Doing

- No `jsdom`, `@testing-library/react`, or component tests — those belong to rollout Phase 2
- No Supabase mocking — `detectCarConflicts` requires none
- No `astro:env/server` mock — the test file does not import `src/lib/supabase.ts`
- No CI YAML changes — deferred to rollout Phase 3 per test plan §3
- No pre-commit hook changes (`lint-staged`) — running tests on every commit is too slow for after-hours solo work; CI gate lands in Phase 3
- No tests for any async service functions (`createEvent`, `listEvents`, etc.) — those require Supabase and belong to Phase 2 or 3

## Implementation Approach

Two phases in dependency order: (1) bootstrap the runner so `npm run test` is a valid command; (2) write the 13 test cases against the live function. Phase 1 is a config-only phase — no application code changes. Phase 2 is additive — one new test file, no changes to `src/lib/services/events.ts`.

## Critical Implementation Details

**`getViteConfig()` requirement.** Do not use a plain `defineConfig` from `vitest/config`. The project uses `astro:env/server` virtual module in `src/lib/supabase.ts`. Even though `events.test.ts` does not import `supabase.ts`, future test files will, and `getViteConfig()` registers the virtual module handler. Starting with it avoids a breaking config change later.

**Type-only imports in test file.** `verbatimModuleSyntax: true` is set in `tsconfig.json`. Any import used only as a type must use `import type`. The `EventWithProfiles` and `ConflictPair` interfaces must be imported as `import type`.

**Test fixture strategy.** The `makeEvent` factory in the test file must return a full `EventWithProfiles` object to satisfy TypeScript. Use `as const` / `as unknown as` only as last resort — prefer providing explicit dummy values for all required fields (`id`, `household_id`, `title`, etc.) so the factory is legible and future tests can reuse it.

---

## Phase 1: Vitest Bootstrap

### Overview

Install Vitest, write the config, and add the `test` / `test:watch` scripts to `package.json`. After this phase, `npm run test` is a recognized command that runs the Vitest CLI.

### Changes Required

#### 1. Install Vitest

**File**: `package.json` (devDependencies, via npm)

**Intent**: Add `vitest` as a dev dependency. Vitest 3.x is the correct major to match the Vite 7 pin in `overrides`.

**Contract**: Run `npm install -D vitest`. The resulting entry should be `"vitest": "^3.x.x"` in `devDependencies`.

#### 2. Add test scripts to `package.json`

**File**: `package.json` (scripts section)

**Intent**: Expose `npm run test` (single CI-style run, exits after all tests) and `npm run test:watch` (interactive watch mode for development).

**Contract**:
```json
"test": "vitest run",
"test:watch": "vitest"
```

#### 3. Create `vitest.config.ts`

**File**: `vitest.config.ts` (project root, sibling of `astro.config.mjs`)

**Intent**: Configure Vitest to use Astro's Vite pipeline (for alias resolution and virtual module registration), run in Node environment (no DOM needed for pure function tests), and pick up only `.test.ts` files (`.test.tsx` is reserved for React component tests in Phase 2).

**Contract**:
```typescript
/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

### Success Criteria

#### Automated Verification

- `npm install -D vitest` completes without errors; `vitest` appears in `package.json` devDependencies
- `npm run test -- --passWithNoTests` exits 0 (runner starts; no test files found yet is acceptable at this phase)
- `npm run lint` passes — no new ESLint errors from the config file
- `npm run build` still passes — config file is test-only and doesn't affect the production build

#### Manual Verification

- `npx vitest --version` prints a 3.x version number
- Running `npm run test -- --passWithNoTests` shows Vitest startup output (not "command not found")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Unit Tests for `detectCarConflicts`

### Overview

Write `src/lib/services/events.test.ts` with a `makeEvent` fixture factory and 13 test cases covering all failure modes: baseline (empty/single), car_needed filter (R2), same-day filter (R2), boundary/overlap (R1), and naive-string same-day assumption (R6).

### Changes Required

#### 1. Create test file

**File**: `src/lib/services/events.test.ts`

**Intent**: Test `detectCarConflicts` exhaustively. The function takes `EventWithProfiles[]` and returns `ConflictPair[]`. All test cases use the `makeEvent` factory to build minimal valid fixtures; the factory supplies dummy values for all non-algorithm fields.

**Contract**:

Imports (at top of file):
```typescript
import { describe, it, expect } from "vitest";
import type { EventWithProfiles } from "@/lib/services/events";
import { detectCarConflicts } from "@/lib/services/events";
```

`makeEvent` factory — override only what the test cares about; defaults produce a safe `car_needed=false` event on 2026-06-20 at 09:00 for 60 minutes:
```typescript
function makeEvent(overrides: Partial<EventWithProfiles> = {}): EventWithProfiles {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    subject_id: "sub-1",
    driver_id: null,
    title: "Test event",
    starts_at: "2026-06-20T09:00:00",
    duration_minutes: 60,
    location: null,
    notes: null,
    car_needed: false,
    created_at: "2026-06-20T00:00:00.000Z",
    updated_at: "2026-06-20T00:00:00.000Z",
    subject: { id: "sub-1", display_name: "Alice", kind: "adult" },
    driver: null,
    ...overrides,
  };
}
```

Test cases — grouped by describe block, one assertion per `it`:

| # | Test name | Setup | Expected |
|---|---|---|---|
| T1 | empty array returns no pairs | `[]` | `[]` |
| T2 | single car event returns no pairs | one `car_needed:true` event | `[]` |
| T3 | two non-car events overlapping return no pairs | two `car_needed:false`, same time | `[]` |
| T4 | one car + one non-car overlapping return no pairs | mixed `car_needed` flags, same time | `[]` |
| T5 | two car events on different days return no pairs | `car_needed:true`, dates differ | `[]` |
| T6 | two car events touching (A.end === B.start) return no pairs | A 09:00–10:00, B 10:00–11:00 | `[]` |
| T7 | touching in reverse (B.end === A.start) returns no pairs | A 10:00–11:00, B 09:00–10:00 | `[]` |
| T8 | two car events with clear overlap return one pair | A 09:00–10:00, B 09:30–10:30 | length 1 |
| T9 | one event fully contained in another returns one pair | A 09:00–12:00, B 09:30–10:00 | length 1 |
| T10 | three car events all overlapping return three pairs | A 09:00–11:00, B 09:30–10:30, C 10:00–11:30 | length 3 |
| T11 | three car events, only two overlap, return one pair | A 09:00–10:00, B 09:30–10:30, C 11:00–12:00 | length 1 |
| T12 | two car events on same naive calendar day near midnight return pair | both `2026-06-20`, times 22:00 and 22:30, 60 min each | length 1 |
| T13 | two car events on consecutive naive calendar days do not conflict | `2026-06-20T23:30:00` and `2026-06-21T00:30:00` | `[]` |

T6 must be named explicitly in a way that communicates the PRD invariant — e.g. `"touching (A ends exactly when B starts) is NOT a conflict per PRD"`.

For T8–T11, assert both `pairs.length` and (for T8/T9) that `pairs[0].a` and `pairs[0].b` are the expected events, to prove the function returns the correct pair objects, not just any two events.

### Success Criteria

#### Automated Verification

- `npm run test` exits 0 with 13 passing tests
- `npm run lint` passes — no new ESLint errors from the test file
- `npm run build` still passes — test file is excluded from the production build by `tsconfig.json` `exclude: ["dist"]` (Vitest runs it separately)

#### Manual Verification

- Test output shows all 13 tests by name — scan for T6 name confirming the PRD invariant is explicitly documented in the test suite
- No test is marked `todo` or `skip`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests

All tests in `src/lib/services/events.test.ts` — covered by Phase 2.

### Integration Tests

None in this change — deferred to rollout Phases 2 and 3.

### Manual Testing Steps

1. After Phase 1: run `npm run test -- --passWithNoTests` → verify Vitest starts and reports "no test files found" or similar, not an error
2. After Phase 2: run `npm run test` → 13 tests pass, no warnings
3. Verify T6 name is visible in output to confirm the PRD invariant test is identifiable in CI output

## Performance Considerations

`detectCarConflicts` is O(n²) over car-needed events. At household scale (< 20 events with `car_needed`), the function runs in microseconds. No performance test is warranted.

## Migration Notes

No schema changes, no data migration, no API changes. The test file is additive.

## References

- Research: `context/changes/testing-algorithm-unit-tests/research.md`
- Test plan (rollout Phase 1): `context/foundation/test-plan.md`
- Function under test: `src/lib/services/events.ts:14–37`
- Type definitions: `src/lib/services/events.ts:3–12`
- Vitest + Astro integration: `astro/config` → `getViteConfig()` (see research §4)
- Car-conflict implementation history: `context/changes/car-conflict-alert/plan.md` §Testing Strategy

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Bootstrap

#### Automated

- [x] 1.1 `npm install -D vitest` completes; `vitest` appears in `package.json` devDependencies
- [x] 1.2 `npm run test -- --passWithNoTests` exits 0
- [x] 1.3 `npm run lint` passes with no new errors
- [x] 1.4 `npm run build` still passes

#### Manual

- [x] 1.5 `npx vitest --version` prints a 3.x version
- [x] 1.6 `npm run test -- --passWithNoTests` shows Vitest startup output (not "command not found")

### Phase 2: Unit Tests for detectCarConflicts

#### Automated

- [ ] 2.1 `npm run test` exits 0 with 13 passing tests
- [ ] 2.2 `npm run lint` passes with no new errors from the test file
- [ ] 2.3 `npm run build` still passes

#### Manual

- [ ] 2.4 Test output shows all 13 tests by name
- [ ] 2.5 T6 name is visible in output confirming the PRD invariant (touching ≠ conflict) is documented in the suite
- [ ] 2.6 No test is marked `todo` or `skip`
