# Testing: Component + Service Coverage — Plan Brief

> Full plan: `context/changes/testing-component-service/plan.md`

## What & Why

Implement Test Plan Phase 2 from `context/foundation/test-plan.md`: add `@testing-library/react` + jsdom infrastructure and write 11 new test cases covering two risks — R3 (`updateEvent` always sets `updated_at` manually, since there is no DB trigger) and R4 (`EventForm` car/driver toggle and edit pre-fill regressions). Phase 1 (algorithm unit tests) is already done; this change builds on the existing Vitest setup.

## Starting Point

Vitest 4.x is installed with 13 passing tests in `events.test.ts` (node environment, `.test.ts` only). No `@testing-library/react`, no `jsdom`, no `.test.tsx` support in the Vitest config. `EventForm` is a controlled/uncontrolled hybrid React component with 196 lines; `updateEvent` is a pure service function that stamps `updated_at` manually in its payload.

## Desired End State

`npm run test` exits 0 with 24 passing tests across two test files. `vitest.config.ts` runs `.test.ts` in node and `.test.tsx` in jsdom via `environmentMatchGlobs`. The R3 and R4 risks from the test plan are verifiably covered with named, non-skipped tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
|---|---|---|
| DOM environment | jsdom via `environmentMatchGlobs` (separate from node for .ts) | Keeps existing algorithm tests in node; only component tests pay the jsdom cost |
| Supabase mock strategy | Manual mock object with vi.fn() fluent chain | `updateEvent` takes SupabaseClient as a plain arg — no module-level mock needed |
| R4 test scope | DOM state only (no FormData/submit interception) | Form uses native POST; DOM field values and toggle visibility give full R4 signal |
| R3 test scope | `updated_at` in payload + timestamp ≈ now() + error throw | Minimal oracle that proves the invariant without over-specifying the full payload |
| Interaction library | `@testing-library/user-event` (async) | Controlled checkbox needs React synthetic events; `fireEvent.click` may not trigger onChange |

## Scope

**In scope:**
- Install 4 dev packages: `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`
- Extend `vitest.config.ts`: `include` + `environmentMatchGlobs` + `setupFiles`
- Create `src/test-setup.ts` (jest-dom matchers registration)
- Add R3 describe block (3 tests) to `src/lib/services/events.test.ts`
- Create `src/components/events/EventForm.test.tsx` (8 tests)

**Out of scope:**
- Snapshot tests, auth component tests, Astro page tests
- Supabase integration / local Supabase (Phase 3)
- CI YAML changes (Phase 3)
- `DeleteEventButton`, `createEvent`, `deleteEvent` tests

## Architecture / Approach

Single Vitest runner, two environments: `node` for `.test.ts` service tests (no DOM overhead), `jsdom` for `.test.tsx` component tests. R3 uses a hand-rolled Supabase fluent chain mock (5 vi.fn() calls capturing the payload passed to `.update()`). R4 uses `render` + `screen` + `userEvent.setup()` to verify DOM state after React re-renders.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Bootstrap | Packages installed, config extended, setup file created | `environmentMatchGlobs` syntax must be correct; existing 13 tests must still pass |
| 2. Service test R3 | 3 `updateEvent` tests pass; R3 risk proven | Fluent Supabase mock chain is fiddly to wire correctly |
| 3. Component test R4 | 8 `EventForm` tests pass; R4 risk proven | Controlled checkbox + userEvent async setup; jsdom missing browser APIs |

**Prerequisites:** Phase 1 (Vitest already installed) complete — ✅ done.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- `@testing-library/jest-dom/vitest` import path — must be exactly this string (not `/extend-expect` which is the Jest path); will fail silently at type level if wrong.
- `EventForm` imports `ServerError` from `@/components/auth/ServerError` — if that component has complex deps (e.g., Astro-specific imports), the test may need a mock; assume it's a simple React component.

## Success Criteria (Summary)

- `npm run test` exits 0 with 24 passing tests (13 + 3 R3 + 8 R4)
- Test output names the R3 and R4 describe blocks explicitly (not anonymous)
- `npm run lint` passes after all changes
