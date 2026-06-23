<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Car Conflict Alert

- **Plan**: `context/changes/car-conflict-alert/plan.md`
- **Scope**: Full plan (Phase 1–3)
- **Date**: 2026-06-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 4 warnings · 5 observations

## Verdicts

| Dimension | Verdict |
|---|---|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | WARNING ⚠️ |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ |
| Success Criteria | PASS ✅ |

> Plan Adherence: all 12 planned changes verified as MATCH. No drift, no missing items, no unplanned extras.

## Findings

### W1 — Functional false positive on `car_conflict=1` signal

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / UX
- **Location**: `src/pages/api/events/index.ts:54`, `src/pages/api/events/[id].ts:51`
- **Detail**: `?car_conflict=1` is emitted whenever `car_needed === true`, not when an actual conflict exists. A user adding the first car-needed event sees the amber "Sprawdź alerty konfliktu auta poniżej." banner with nothing below it. The list page already renders conflict banners via `detectCarConflicts` on every load.
- **Fix A ⭐ Recommended**: Remove `?car_conflict=1` from both API routes entirely — the list page is authoritative for conflict display.
  - Strength: Eliminates false positives; simpler redirect logic.
  - Tradeoff: Loses the "look down" affordance on first car-needed event.
  - Confidence: HIGH
  - Blind spot: None significant.
- **Fix B**: Accept false positive — amber banner is educational for first-time car-needed users.
- **Decision**: FIXED via Fix A — removed `?car_conflict=1` from both API routes and removed `carConflictMsg` banner from events list

### W2 — `class:list` with template literal violates `cn()` convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/events/index.astro:96`
- **Detail**: `class:list` receives a template string — equivalent to string concatenation, violating the project rule "Do not concatenate Tailwind class strings. Use `cn()` from `@/lib/utils`." Tailwind Merge won't deduplicate conflicting border classes.
- **Fix**: Replace with `class={cn("rounded-2xl border bg-white/10 p-4 text-white backdrop-blur-xl", isConflicting && "border-l-4 border-l-red-400 border-red-400/50")}`.
- **Decision**: FIXED — replaced template literal with `cn()` on conflicting card `<li>`

### W3 — Silent `listEvents` error shows "no events" instead of an error message

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/events/index.astro:8`
- **Detail**: Pre-existing `.catch(() => [])` silently absorbs DB/network errors. User sees "Nie masz jeszcze żadnych wydarzeń." — indistinguishable from a real empty household. Not introduced by S-02.
- **Fix**: Catch error into a variable and render an error banner, consistent with API-level error handling.
- **Decision**: PENDING

### W4 — `eventId` used without UUID format validation on edit endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Input validation
- **Location**: `src/pages/api/events/[id].ts:19`
- **Detail**: Pre-existing `context.params.id ?? ""` is passed directly to Supabase without UUID validation. Malformed input yields a confusing "Failed to update event" DB error. RLS protects data integrity — this is a UX/DX issue. Not introduced by S-02.
- **Fix**: Add `z.uuid().safeParse(context.params.id)` at the top of the handler and redirect with an error on failure.
- **Decision**: PENDING

### O1 — Same-day filter uses UTC date prefix, not local calendar day

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Correctness (edge case)
- **Location**: `src/lib/services/events.ts:23`
- **Detail**: `.slice(0,10)` compares the UTC date portion. Events near midnight in UTC+N households may have different UTC prefixes despite being the same local day. The overlap math is correct; the same-day guard is the risk. Unlikely to affect current use.
- **Decision**: PENDING

### O2 — `fmtTime` helper allocated inside `.map()` callback

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Style / minor performance
- **Location**: `src/pages/events/index.astro:64–65`
- **Detail**: A new function object is created on every `.map()` iteration. Hoist above the map call.
- **Decision**: PENDING

### O3 — Duplicate Zod schemas across CREATE and EDIT routes

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Maintainability
- **Location**: `src/pages/api/events/index.ts:6–16`, `src/pages/api/events/[id].ts:6–16`
- **Detail**: `newEventSchema` and `updateEventSchema` are structurally identical — any field change must be made in two places. Pre-existing, not introduced by S-02.
- **Decision**: PENDING

### O4 — `listEvents` is unbounded; conflict detection runs over all-time history

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Performance
- **Location**: `src/lib/services/events.ts:68–84`, `src/pages/events/index.astro:8–9`
- **Detail**: No date filter on `listEvents`. As household accumulates events, conflict detection O(n²) will grow. Conflict UI is only meaningful for upcoming events anyway.
- **Decision**: PENDING

### O5 — `getHouseholdId` discards Supabase error silently

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Observability
- **Location**: `src/lib/services/events.ts:42–44`
- **Detail**: Error object dropped — can't distinguish "no household" (expected) from RLS reject or timeout (unexpected). Pre-existing.
- **Decision**: PENDING
