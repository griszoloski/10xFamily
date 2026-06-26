# Testing: Component + Service Coverage — Implementation Plan

## Overview

Bootstrap React component testing infrastructure and write targeted tests for two risks from `context/foundation/test-plan.md` Phase 2: **R3** (`updateEvent` always sets `updated_at`) and **R4** (`EventForm` car/driver toggle, edit pre-fill, field state). Vitest is already installed from Phase 1; this change adds `@testing-library/react` + `jsdom`, extends the config to run `.test.tsx` files in a DOM environment, and writes 11 new test cases across two test files.

## Current State Analysis

- **Vitest 4.x** installed (`vitest.config.ts` at project root); `src/**/*.test.ts` in `node` environment — 13 passing tests in `src/lib/services/events.test.ts`.
- `vitest.config.ts` uses manual `@` alias via `resolve.alias` (not `getViteConfig()` — Cloudflare plugin incompatibility documented in config comment). Same alias approach works for `.test.tsx`.
- **`src/components/events/EventForm.tsx`** — 196 lines. `car_needed` is a **controlled** checkbox (`checked`/`onChange`). All other inputs use `defaultValue` (uncontrolled). Driver dropdown only renders when `carNeeded === true`. Form uses native `method="POST"` — no `fetch`/`onSubmit` handler.
- **`updateEvent`** (`src/lib/services/events.ts:141`) — takes `SupabaseClient` as first arg, builds `{ ...update, updated_at: new Date().toISOString() }` payload, calls `.update(payload).eq("id", eventId).select().single()`. No DB trigger — `updated_at` is set manually in application code.
- **No `@testing-library/react`, `jsdom`, or `@testing-library/jest-dom`** installed.
- **`vitest.config.ts` `include`** is `["src/**/*.test.ts"]` — `.test.tsx` files not picked up. No `setupFiles` configured.
- `verbatimModuleSyntax: true` in tsconfig — type-only imports must use `import type`.

## Desired End State

`npm run test` exits 0 with **24 passing tests** (13 existing + 3 R3 + 8 R4). Two new test files exist:
- `src/lib/services/events.test.ts` — extended with R3 `updateEvent` describe block
- `src/components/events/EventForm.test.tsx` — new file with R4 cases

`npm run lint` passes with no new errors. The `vitest.config.ts` runs `.test.ts` in `node` and `.test.tsx` in `jsdom` via `environmentMatchGlobs`.

### Key Discoveries

- `EventForm` imports `ServerError` from `@/components/auth/ServerError` — must be resolvable in test; the `@` alias in vitest.config handles it; no manual mock needed unless ServerError has complex deps.
- `car_needed` checkbox is controlled — React `onChange` fires when clicked via `userEvent.click`; `fireEvent.click` may not trigger React synthetic events reliably; use `@testing-library/user-event`.
- `defaultValue` inputs (title, date, etc.) — their DOM `.value` is readable from the input element after render; `screen.getByRole("textbox", { name: /tytu/i })` returns the element, then assert `.value`.
- The Supabase fluent chain in `updateEvent`: `.from("events").update(payload).eq("id", id).select().single()` — mock must implement this chain; `single()` must return `Promise<{ data, error }>`.
- `updated_at` timestamp assertion: capture the time before calling `updateEvent`, call it, assert `new Date(capturedPayload.updated_at) >= beforeTime`. Avoids brittle fixed-timestamp comparison.
- `@testing-library/jest-dom` extends Vitest matchers via a setup file importing `"@testing-library/jest-dom/vitest"` — this must run before any test file.

## What We're NOT Doing

- No snapshot tests — anti-pattern per test plan §5.
- No tests for `createEvent`, `deleteEvent`, `listEvents`, or other service functions — out of scope for Phase 2.
- No tests for Astro pages (`dashboard.astro`, `edit.astro`) — SSR pages need E2E or integration setup.
- No Supabase integration / local Supabase — Phase 3.
- No CI YAML changes — Phase 3.
- No pre-commit hook changes.
- No tests for `DeleteEventButton` (pure UI toggle, no domain logic), `SignInForm`, or auth components.

## Implementation Approach

Three phases in dependency order. Phase 1 is config-only — no test logic. Phases 2 and 3 are additive test files; Phase 3 depends on Phase 1 (DOM environment) but is independent of Phase 2 (service test runs in node). Both test files follow the same `describe`/`it` + `makeEvent`/`makeMock` factory pattern established in Phase 1.

## Critical Implementation Details

**Supabase fluent chain mock.** `updateEvent` calls `.from("events").update(payload).eq("id", id).select().single()`. Each method must return an object with the next method. Only `single()` is async (returns `Promise<{data, error}>`). Build the chain bottom-up and capture the `payload` argument from the `update` call:

```typescript
function makeSupabaseMock(returnVal: { data: Event | null; error: { message: string } | null }) {
  const singleFn = vi.fn().mockResolvedValue(returnVal);
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const eqFn = vi.fn().mockReturnValue({ select: selectFn });
  const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
  return { supabase: { from: vi.fn().mockReturnValue({ update: updateFn }) }, updateFn };
}
```

Capture payload via `updateFn.mock.calls[0][0]`.

**`environmentMatchGlobs` replaces `environment`.** Remove the top-level `environment: "node"` key from the `test` block and use `environmentMatchGlobs` to assign per-glob. Both globs must be listed; omitting one leaves Vitest using the default (`node`), which is fine for `.test.ts` but must be confirmed explicit.

**`@testing-library/jest-dom/vitest` import path.** The correct import for Vitest is `import "@testing-library/jest-dom/vitest"` (not `"/extend-expect"` which is the Jest path). This registers `toBeInTheDocument`, `toHaveValue`, `toBeChecked`, etc. as Vitest matchers.

---

## Phase 1: Bootstrap — DOM test environment

### Overview

Install four dev packages, extend `vitest.config.ts` with `environmentMatchGlobs` and `setupFiles`, and create the Vitest setup file that registers `@testing-library/jest-dom` matchers. After this phase `npm run test -- --passWithNoTests` exits 0 and `npm run lint` passes.

### Changes Required

#### 1. Install test packages

**File**: `package.json` (via npm)

**Intent**: Add the four packages needed for React DOM tests.

**Contract**: Run `npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`. Resulting devDependency entries: `"@testing-library/react"`, `"@testing-library/user-event"`, `"@testing-library/jest-dom"`, `"jsdom"`.

#### 2. Extend `vitest.config.ts`

**File**: `vitest.config.ts`

**Intent**: Add `.test.tsx` to `include`, replace `environment: "node"` with `environmentMatchGlobs`, and register the setup file.

**Contract**:
```typescript
test: {
  name: "unit",
  include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  environmentMatchGlobs: [
    ["src/**/*.test.ts", "node"],
    ["src/**/*.test.tsx", "jsdom"],
  ],
  setupFiles: ["src/test-setup.ts"],
},
```

Remove the old `environment: "node"` key if present as a standalone field.

#### 3. Create `src/test-setup.ts`

**File**: `src/test-setup.ts`

**Intent**: Register `@testing-library/jest-dom` Vitest matchers globally so every `.test.tsx` file has `toBeInTheDocument`, `toHaveValue`, `toBeChecked`, etc. without importing them per-file.

**Contract**: Single line: `import "@testing-library/jest-dom/vitest";`

### Success Criteria

#### Automated Verification

- All four packages appear in `package.json` devDependencies
- `npm run test -- --passWithNoTests` exits 0 (existing 13 tests still pass)
- `npm run lint` passes

#### Manual Verification

- `npx vitest --version` still prints 4.x

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Service Test — R3 `updateEvent`

### Overview

Add a new `describe` block to the existing `src/lib/services/events.test.ts` with 3 test cases proving that `updateEvent` always stamps `updated_at` in the Supabase payload.

### Changes Required

#### 1. Add R3 tests to `src/lib/services/events.test.ts`

**File**: `src/lib/services/events.test.ts`

**Intent**: Add a new `describe("updateEvent — R3: updated_at always stamped", ...)` block after the existing `detectCarConflicts` describe. Use a `makeSupabaseMock` factory (defined once, reused across tests) that captures the `payload` argument passed to `.update()`.

**Contract**:

New imports to add at the top of the existing file (after existing imports):
```typescript
import type { Event } from "@/types";
import { updateEvent } from "@/lib/services/events";
```

`makeSupabaseMock` factory — defined inside the new describe block or at file scope:
```typescript
function makeSupabaseMock(returnVal: { data: Event | null; error: { message: string } | null }) {
  const singleFn = vi.fn().mockResolvedValue(returnVal);
  const selectFn = vi.fn().mockReturnValue({ single: singleFn });
  const eqFn = vi.fn().mockReturnValue({ select: selectFn });
  const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
  return { supabase: { from: vi.fn().mockReturnValue({ update: updateFn }) }, updateFn };
}
```

`makeEventFixture` for the return value (reuse the existing `makeEvent` if it satisfies `Event` type, or define a minimal `Event` fixture inline).

Test cases:

| # | Test name | Setup | Assertion |
|---|---|---|---|
| T14 | includes `updated_at` in every UPDATE payload | mock returns valid event; call `updateEvent(supabase, id, { title: "X" })` | `capturedPayload.updated_at` is defined and is a non-empty string |
| T15 | `updated_at` is an ISO string close to now() | record `before = Date.now()` before call; call `updateEvent` | `new Date(capturedPayload.updated_at).getTime() >= before` and `<= Date.now() + 100` |
| T16 | throws when Supabase returns an error | mock returns `{ data: null, error: { message: "DB error" } }` | `await expect(updateEvent(...)).rejects.toThrow("DB error")` |

### Success Criteria

#### Automated Verification

- `npm run test` exits 0 with 16 passing tests (13 existing + 3 new)
- `npm run lint` passes

#### Manual Verification

- Test output shows all three R3 tests by name under the `updateEvent — R3` describe heading

**Implementation Note**: After Phase 2 passes, pause for confirmation before Phase 3.

---

## Phase 3: Component Test — R4 `EventForm`

### Overview

Create `src/components/events/EventForm.test.tsx` with 8 test cases covering create-mode defaults, edit-mode pre-fill, driver-dropdown conditional rendering, and car/driver toggle behavior.

### Changes Required

#### 1. Create `src/components/events/EventForm.test.tsx`

**File**: `src/components/events/EventForm.test.tsx`

**Intent**: Test `EventForm` behavioral contracts: create vs edit mode detection, field pre-fill from `initialValues`, car/driver toggle state transitions.

**Contract**:

Imports:
```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HouseholdMemberProfile } from "@/types";
import EventForm from "@/components/events/EventForm";
```

`makeProfile` factory — returns a minimal `Pick<HouseholdMemberProfile, "id" | "display_name" | "kind">`:
```typescript
function makeProfile(overrides = {}): Pick<HouseholdMemberProfile, "id" | "display_name" | "kind"> {
  return { id: "p-1", display_name: "Alice", kind: "adult", ...overrides };
}
```

`makeInitialValues` factory — returns a full `InitialValues` object (all required fields filled):
```typescript
function makeInitialValues(overrides = {}) {
  return {
    title: "Test event", subject_id: "p-1", date: "2026-06-20", time: "09:00",
    duration_minutes: 60, location: null, notes: null, car_needed: false, driver_id: null,
    ...overrides,
  };
}
```

Test cases:

| # | Describe block | Test name | Setup | Assertion |
|---|---|---|---|---|
| T17 | create mode | renders "Dodaj wydarzenie" submit button | `render(<EventForm profiles={[makeProfile()]} />)` | `screen.getByRole("button", { name: /dodaj wydarzenie/i })` exists |
| T18 | create mode | driver dropdown NOT rendered by default | same render | `screen.queryByLabelText(/kto jedzie/i)` is null |
| T19 | edit mode | renders "Zapisz zmiany" submit button | render with `initialValues` + `eventId` | `screen.getByRole("button", { name: /zapisz zmiany/i })` exists |
| T20 | edit mode | pre-fills title input from initialValues | render with `initialValues.title = "Wizyta"` | `screen.getByRole("textbox", { name: /tytu/i })` has `.value === "Wizyta"` |
| T21 | edit mode | driver dropdown NOT rendered when car_needed is false | render with `initialValues.car_needed = false` | `screen.queryByLabelText(/kto jedzie/i)` is null |
| T22 | edit mode | driver dropdown rendered when car_needed is true | render with `initialValues.car_needed = true` | `screen.getByLabelText(/kto jedzie/i)` exists |
| T23 | car/driver toggle | clicking car_needed shows driver dropdown | render create mode; `await userEvent.click(screen.getByLabelText(/auto potrzebne/i))` | `screen.getByLabelText(/kto jedzie/i)` is in the document |
| T24 | car/driver toggle | clicking car_needed twice hides driver dropdown | render; click twice | `screen.queryByLabelText(/kto jedzie/i)` is null after second click |

T23 and T24 each need `const user = userEvent.setup()` and `await user.click(...)` (the async form of userEvent).

### Success Criteria

#### Automated Verification

- `npm run test` exits 0 with 24 passing tests (16 from Phases 1–2 + 8 new)
- `npm run lint` passes

#### Manual Verification

- Test output shows all 8 R4 tests by name, organized under their describe headings
- No test is marked `todo` or `skip`
- `npm run test` output explicitly lists the R4 file `src/components/events/EventForm.test.tsx`

---

## Testing Strategy

### Unit Tests

- `src/lib/services/events.test.ts` — extended with R3 `updateEvent` describe block (T14–T16)
- `src/components/events/EventForm.test.tsx` — new file with R4 cases (T17–T24)

### Integration Tests

None in this change — deferred to Phase 3.

### Manual Testing Steps

1. After Phase 1: run `npm run test -- --passWithNoTests` → 13 tests pass, config change didn't break existing suite
2. After Phase 2: run `npm run test` → 16 tests, R3 describe visible in output
3. After Phase 3: run `npm run test` → 24 tests, R4 describe visible, no skip/todo

## Performance Considerations

Component tests with jsdom are fast (< 50ms each). Total run time should stay under 2 seconds.

## Migration Notes

No schema changes, no data migration, no API changes. All changes are additive test files + config extensions.

## References

- Test plan Phase 2: `context/foundation/test-plan.md` §3
- Risk R3 detail: `context/foundation/test-plan.md` §2 R3 row
- Risk R4 detail: `context/foundation/test-plan.md` §2 R4 row
- Phase 1 test pattern: `src/lib/services/events.test.ts`
- Function under test (R3): `src/lib/services/events.ts:141`
- Component under test (R4): `src/components/events/EventForm.tsx`
- Vitest config: `vitest.config.ts`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Bootstrap — DOM test environment

#### Automated

- [x] 1.1 All four packages appear in `package.json` devDependencies — 8dddfa8
- [x] 1.2 `npm run test -- --passWithNoTests` exits 0 (13 tests still pass) — 8dddfa8
- [x] 1.3 `npm run lint` passes — 8dddfa8

#### Manual

- [x] 1.4 `npx vitest --version` still prints 4.x — 8dddfa8

### Phase 2: Service Test — R3 updateEvent

#### Automated

- [x] 2.1 `npm run test` exits 0 with 16 passing tests — ad55a54
- [x] 2.2 `npm run lint` passes — ad55a54

#### Manual

- [x] 2.3 Test output shows all three R3 tests by name under `updateEvent — R3` describe heading — ad55a54

### Phase 3: Component Test — R4 EventForm

#### Automated

- [ ] 3.1 `npm run test` exits 0 with 24 passing tests
- [ ] 3.2 `npm run lint` passes

#### Manual

- [ ] 3.3 Test output shows all 8 R4 tests by name
- [ ] 3.4 No test is marked `todo` or `skip`
- [ ] 3.5 `npm run test` output explicitly lists `src/components/events/EventForm.test.tsx`
