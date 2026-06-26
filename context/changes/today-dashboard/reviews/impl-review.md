<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Today Dashboard

- **Plan**: context/changes/today-dashboard/plan.md
- **Scope**: All phases (1–2)
- **Date**: 2026-06-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ |
| Safety & Quality | WARNING ⚠️ (2 warnings) |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ (1 observation) |
| Success Criteria | PASS ✅ |

## Findings

### F1 — UTC date boundaries break "today" for UTC+2 users at midnight

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Data Safety)
- **Location**: src/pages/dashboard.astro:7–9
- **Detail**: `todayStr = new Date().toISOString().slice(0, 10)` is always UTC. Cloudflare Workers execute at UTC. Events are stored as naive local ISO strings (Polish time, UTC+2). Between 00:00–02:00 CET (22:00–00:00 UTC), `todayStr` is still yesterday's UTC date — events the user added for "today" disappear from the dashboard, and some of tomorrow's events appear as "today". Documented as known R6-style limitation in the plan ("new Date().toISOString().slice(0,10) daje datę UTC — akceptowalne dla MVP").
- **Fix A ⭐ Recommended**: Accept as known MVP limitation; add a code comment documenting this explicitly so future devs know it's intentional, not a bug.
  - Strength: Zero code change; plan already acknowledges this.
  - Tradeoff: Real UX issue for 2h window every night.
  - Confidence: HIGH — consistent with plan's explicit note.
  - Blind spot: If household uses the app precisely at midnight, they will see wrong data.
- **Fix B**: Derive date in Warsaw timezone: `new Date().toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).split(".").reverse().join("-")`.
  - Strength: Correct for UTC+2 household; 2-line change.
  - Tradeoff: Hard-codes Polish timezone; needs updating for DST edge cases.
  - Confidence: MED — Cloudflare Workers support `Intl`; needs smoke test.
  - Blind spot: No test infrastructure for this boundary yet.
- **Decision**: FIXED via Fix B — `toWarsawDate()` helper using `Intl`/`Europe/Warsaw` locale

### F2 — `listEventsByDateRange` accepts unvalidated `from`/`to` strings

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/events.ts:87
- **Detail**: `from` and `to` are passed straight to `.gte()/.lte()` with no format validation. If `from > to` (reversed range), the query returns silently empty results with no error. Current caller (dashboard.astro) constructs them from `new Date()` — safe. But the project's lesson (F6 from S-03 review) states all inputs should be validated. A future API route with user-supplied date params would be a footgun. Also missing a JSDoc comment explaining the caller contract.
- **Fix**: Add a simple regex guard + reversed-range check at the top of the function, and a JSDoc comment with the RLS note.
- **Decision**: SKIPPED — current caller is safe; add validation if exposed via API route in the future

### F3 — DB errors silently show empty dashboard

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/dashboard.astro:13
- **Detail**: `listEventsByDateRange(...).catch(() => [])` silently swallows DB errors — user sees "Brak wydarzeń na dziś." indistinguishable from a genuinely empty schedule. This matches the pattern in `events/index.astro:9`, so it's not a regression. The fix would require a pattern change across multiple pages.
- **Fix**: Capture error state, render a dismissible error banner when `fetchError = true`.
- **Decision**: SKIPPED — consistent with existing events/index.astro pattern; systemic fix needed

### F4 — `location` field absent from dashboard event cards

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/dashboard.astro:95–99
- **Detail**: `events/index.astro` renders `{event.location && <span>Lokalizacja: {event.location}</span>}` on each card. Neither the "Dziś" nor "Najbliższe 7 dni" cards in the dashboard include this field. May be intentional (condensed view) or accidental omission.
- **Fix**: Either add `{event.location && <span>Lokalizacja: {event.location}</span>}` to both card types, or add a comment: `{/* location intentionally omitted for dashboard density */}`.
- **Decision**: FIXED — added `location` field to both "Dziś" and "Najbliższe 7 dni" card templates

### F5 — `data` cast without null guard in `listEventsByDateRange`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/lib/services/events.ts:109
- **Detail**: `return data as EventWithProfiles[]` mirrors the existing `listEvents` pattern (line 84). For `.select()` without `.single()`, Supabase guarantees a non-null array on success — so this is safe in practice. The inconsistency with other service functions that check `if (error || !data)` makes the pattern harder to audit.
- **Fix**: Add `if (!data) return [];` after the error check for defensive consistency.
- **Decision**: SKIPPED — linter confirms `data` is never null after error check; TypeScript types are correct
