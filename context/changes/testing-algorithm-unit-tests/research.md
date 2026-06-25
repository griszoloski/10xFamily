---
date: 2026-06-25T09:42:00+02:00
researcher: AI agent (Cursor)
git_commit: 211ed18ec9ce15ebcfbdd355087b10e4198aee13
branch: master
repository: 10xFamily
topic: "Ground rollout Phase 1 — detectCarConflicts unit tests + Vitest bootstrap"
tags: [research, testing, conflict-detection, vitest, events-service]
status: complete
last_updated: 2026-06-25
last_updated_by: AI agent (Cursor)
---

# Research: Ground Phase 1 — Algorithm Unit Tests

**Date**: 2026-06-25T09:42:00+02:00
**Git Commit**: 211ed18ec9ce15ebcfbdd355087b10e4198aee13
**Branch**: master
**Repository**: 10xFamily

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md`.

Risks to verify: R1 (conflict detection false negative), R2 (conflict detection false positive), R6 (same-day filter timezone edge at midnight boundary).
Risk response guidance to verify, not blindly accept:
- R1: prove two car-flagged overlapping events produce an alert; prove events touching at end==start do NOT; challenge "overlap handles boundary correctly"
- R2: prove non-overlapping/no-car-flag/different-day pairs produce NO alert; challenge "car_needed filter applied before overlap check"
- R6: prove midnight-boundary events in UTC+2 treated as same-day; challenge "slice(0,10) works for midnight events"

## Summary

`detectCarConflicts` is a **pure, synchronous function** at `src/lib/services/events.ts:14–37`. It is directly and cheaply unit-testable — no DB, no Supabase client, no `astro:env` needed. Vitest (v3.x, matching the pinned Vite 7.3.3) bootstraps with a single `vitest.config.ts` using `getViteConfig()` from Astro, which resolves the `@/*` path alias automatically.

Risk verification summary:
- **R1 confirmed testable**: overlap condition `aStart < bEnd && bStart < aEnd` is strict less-than; touching boundary (end==start) is correctly NOT a conflict. An explicit test case is essential to lock this PRD invariant.
- **R2 confirmed testable**: `car_needed` filter runs first (line 15), before any date or time comparison. Negative cases (no-flag, different-day, non-overlapping) are all testable with the same function.
- **R6 guidance corrected**: since events are stored as naive local ISO strings (no `Z`, no offset) by S-01, `.slice(0,10)` compares the user-typed calendar date directly. There is no UTC-drift risk for the same-day comparison. However, the `.getTime()` call on the naive string is Node-runtime-dependent — a clarifying test that locks the "naive strings compared pairwise in same runtime = consistent result" assumption is still valuable.

## Detailed Findings

### 1. `detectCarConflicts` — exact implementation

**File**: `src/lib/services/events.ts:14–37`

```typescript
export function detectCarConflicts(events: EventWithProfiles[]): ConflictPair[]  {
  const carEvents = events.filter((e) => e.car_needed);           // line 15 — car_needed filter FIRST
  const pairs: ConflictPair[] = [];

  for (let i = 0; i < carEvents.length; i++) {
    for (let j = i + 1; j < carEvents.length; j++) {
      const a = carEvents[i];
      const b = carEvents[j];

      if (a.starts_at.slice(0, 10) !== b.starts_at.slice(0, 10)) continue;  // line 23 — same-day via raw string

      const aStart = new Date(a.starts_at).getTime();
      const aEnd   = aStart + a.duration_minutes * 60_000;
      const bStart = new Date(b.starts_at).getTime();
      const bEnd   = bStart + b.duration_minutes * 60_000;

      if (aStart < bEnd && bStart < aEnd) {          // line 30 — strict less-than: touch ≠ conflict
        pairs.push({ a, b });
      }
    }
  }
  return pairs;
}
```

Key facts grounded:

| Property | Value |
|---|---|
| Location | `src/lib/services/events.ts:14–37` |
| Signature | `(events: EventWithProfiles[]): ConflictPair[]` |
| Dependencies | None — pure function, no imports beyond types |
| Input type | `EventWithProfiles` — events with joined `subject` and `driver` profile data |
| car_needed filter | Line 15: applied BEFORE any date/time comparison |
| Same-day check | Line 23: raw string `.slice(0, 10)` on `starts_at` (`YYYY-MM-DD` prefix) |
| Overlap condition | Line 30: `aStart < bEnd && bStart < aEnd` — both operators are **strict** `<` |
| Touch (end==start) | NOT a conflict — correctly excluded by strict `<` |
| Pair deduplication | `i < j` nested loop — each pair produced at most once |
| Mutates input | No |
| Async | No |

### 2. `starts_at` storage format — critical for R6

Grounded from `src/pages/api/events/index.ts:37`:
```typescript
const starts_at = `${date}T${time}:00`;   // naive local string — NO 'Z', NO offset
```

And `src/pages/api/events/[id].ts:37` (update path — same construction):
```typescript
const starts_at = `${date}T${time}:00`;
```

Events are **always stored as naive local ISO strings** (`"2026-06-20T09:00:00"`). There is no timezone suffix. This means:

1. **`.slice(0,10)` same-day check**: compares the user-typed calendar date prefix (`YYYY-MM-DD`) directly from the stored string. No UTC conversion happens. A Polish parent who types date="2026-06-20" gets `starts_at.slice(0,10) === "2026-06-20"` — regardless of their timezone. **The O1 concern (impl-review) is lower risk than initially assessed** because the date prefix IS the user's local calendar date, not a UTC-converted date.

2. **`.getTime()` for overlap math**: `new Date("2026-06-20T22:00:00").getTime()` in Node.js treats the naive string as **local time** (not UTC). In Cloudflare Workers (which runs in UTC), this gives the UTC epoch for 22:00 UTC. Since **both events in a comparison are stored and parsed identically**, the relative math (`aStart < bEnd && bStart < aEnd`) is internally consistent — a 30-min gap is 30 min regardless of which UTC offset the runtime applies.

**R6 corrected guidance**: The actual risk is not "wrong day on the same-day check" — it's "if some future change stores events WITH a 'Z' suffix, the `.slice(0,10)` comparison would still work (the date prefix doesn't change), but `.getTime()` would give UTC absolute times, and mixing naive+UTC storage would break pairwise comparisons." A test should lock the naive-string assumption explicitly.

### 3. Supporting types — test fixture requirements

From `src/lib/services/events.ts:1–12` and `src/types.ts`:

```typescript
export interface EventWithProfiles extends Event {
  subject: Pick<HouseholdMemberProfile, "id" | "display_name" | "kind">;
  driver: Pick<HouseholdMemberProfile, "id" | "display_name"> | null;
}

export interface ConflictPair {
  a: EventWithProfiles;
  b: EventWithProfiles;
}
```

Minimum fields the test fixture must provide (only these are read by `detectCarConflicts`):
- `car_needed: boolean`
- `starts_at: string` (naive ISO `YYYY-MM-DDTHH:MM:SS`)
- `duration_minutes: number`

All other fields (`id`, `title`, `household_id`, `subject`, `driver`, etc.) can be dummy values. A small `makeEvent()` factory helper in the test file is the right pattern.

### 4. Vitest bootstrap — exact setup for this stack

**Packages to install** (Phase 1 only):
```bash
npm install -D vitest
```

Vitest 3.x is the correct major — it aligns with Vite 7.3.3 which is already pinned in `package.json` `overrides`. No version conflict.

**`vitest.config.ts`** (project root):
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

`getViteConfig()` handles:
- `@/*` → `./src/*` path alias (from `tsconfig.json`)
- Astro's Vite plugin pipeline alignment
- No manual `resolve.alias` needed

**`package.json` scripts to add**:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Test file location**: `src/lib/services/events.test.ts`

No need for jsdom, `@testing-library/react`, or `astro:env/server` mock for Phase 1 — `detectCarConflicts` has zero imports.

### 5. Required test cases — complete inventory

| # | Description | Expected result | Risk |
|---|---|---|---|
| T1 | Empty array | `[]` | baseline |
| T2 | Single car event | `[]` | baseline (no pair possible) |
| T3 | Two events, both `car_needed=false`, overlapping same day | `[]` | R2 — car filter |
| T4 | One `car_needed=true`, one `car_needed=false`, overlapping same day | `[]` | R2 — car filter |
| T5 | Two `car_needed=true`, different days | `[]` | R2 — same-day filter |
| T6 | Two `car_needed=true`, same day, touching: A ends exactly when B starts | `[]` | **R1 critical** — PRD "touching ≠ conflict" |
| T7 | Two `car_needed=true`, same day, touching: B ends exactly when A starts (reverse) | `[]` | R1 — commutative |
| T8 | Two `car_needed=true`, same day, clear overlap (A 09:00–10:00, B 09:30–10:30) | `[{a,b}]` | R1 — happy path |
| T9 | Two `car_needed=true`, same day, one fully contains the other | `[{a,b}]` | R1 — containment |
| T10 | Three `car_needed=true`, same day, all overlapping | 3 pairs | R1 — multiple pairs |
| T11 | Three `car_needed=true`, same day, only two overlap | 1 pair | R1/R2 — partial overlap |
| T12 | Two `car_needed=true`, same naive local date near midnight (`22:00` and `23:00`) | `[{a,b}]` | R6 — same-day check with late events |
| T13 | Two `car_needed=true`, naive strings on consecutive dates (`2026-06-20T23:30`, `2026-06-21T00:30`) | `[]` | R6 — different calendar days |

T6 is the most critical: it encodes the PRD invariant that touching is not a conflict. If this test ever fails, the algorithm has regressed.

### 6. API routes — R1/R2 post-research note

`index.ts` and `[id].ts` call `createEvent`/`updateEvent` but do NOT call `detectCarConflicts`. The algorithm runs only in the Astro page frontmatter (`src/pages/events/index.astro`) and `src/pages/dashboard.astro` on the read path. API routes have no overlap-detection logic to test in Phase 1.

### 7. Response guidance corrections

| Risk | Correction |
|---|---|
| R3 | `updated_at` IS set manually in `updateEvent` (`src/lib/services/events.ts:127`): `updated_at: new Date().toISOString()` — already implemented. The risk is confirmed present and working, but R3 tests should verify it actually changes (not just that the field exists). |
| R6 | **Corrected**: same-day check via `.slice(0,10)` is correct for naive string storage. The risk is not "wrong day" but "assumption breaks if storage format changes." Tests should assert the naive-string pair comparison assumption explicitly (T12, T13 above). |

## Code References

- `src/lib/services/events.ts:14–37` — `detectCarConflicts` full implementation
- `src/lib/services/events.ts:1–12` — `EventWithProfiles` and `ConflictPair` interface definitions
- `src/pages/api/events/index.ts:37` — naive ISO string construction (`${date}T${time}:00`)
- `src/pages/api/events/[id].ts:37` — same construction in update path
- `package.json:63–65` — `overrides.vite: "^7.3.2"` — Vite version pin
- `tsconfig.json:8–11` — `@/*` path alias
- `astro.config.mjs:1–23` — Astro config (no test-related config yet)

## Architecture Insights

- `detectCarConflicts` is intentionally pure and kept out of API routes — the plan notes "TS in-memory is sufficient at small scale (n < 200 events)" and explicitly decided against Postgres `tstzrange &&` for S-02.
- The function lives in `src/lib/services/events.ts` alongside all async Supabase functions — this colocation is intentional and maintained across all slices.
- No mocking infrastructure is needed for Phase 1. The pure function is directly importable in a Vitest test with `import { detectCarConflicts } from "@/lib/services/events"`.

## Historical Context

- `context/changes/car-conflict-alert/plan.md` — Phase 1 of S-02 explicitly noted the unit test cases (touching, different-day, overlap, three-way) in `## Testing Strategy`. These were written as design intent but never implemented (no test runner existed). This research picks up exactly where that list left off.
- `context/changes/events-schema-and-rls/plan.md:213` — "Infrastruktura testowa pojawi się w pierwszym slice, który jej realnie potrzebuje (najpewniej S-02 dla unit-testów algorytmu konfliktów)." — S-02 explicitly anticipated Vitest introduction; this is Phase 1 of the test rollout finally executing that intent.

## Open Questions

None that block Phase 1. The following are confirmed non-issues:
- No `astro:env/server` mock needed (pure function has no imports)
- No jsdom needed (node environment sufficient)
- No Supabase client needed
- `@/*` alias resolution: handled by `getViteConfig()`

One watch item for Phase 2 (not blocking Phase 1):
- When component tests are added (`EventForm.tsx`), `jsdom` + `@testing-library/react` will be needed, and `astro:env/server` will need a mock at the Vitest config level.
