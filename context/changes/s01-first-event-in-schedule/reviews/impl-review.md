<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 Pierwsze wydarzenie w harmonogramie

- **Plan**: context/changes/s01-first-event-in-schedule/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-06-11
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension            | Verdict |
|----------------------|---------|
| Plan Adherence       | PASS ✅  |
| Scope Discipline     | PASS ✅  |
| Safety & Quality     | WARNING ⚠️ (3 findings) |
| Architecture         | PASS ✅  |
| Pattern Consistency  | WARNING ⚠️ (2 observations) |
| Success Criteria     | PASS ✅  |

## Findings

### F1 — Missing auth gate on POST /api/events

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/events/index.ts (top of POST handler) + src/middleware.ts:3
- **Detail**: `PROTECTED_ROUTES` contains `"/events"` which guards the UI pages. The API route lives at `/api/events` — `"/api/events".startsWith("/events")` is `false`, so middleware never intercepts unauthenticated requests to the endpoint. The handler has no `context.locals.user` check. An unauthenticated caller reaches the Supabase client and issues a `getHouseholdId` DB round-trip before the request fails (no household → redirect). RLS is the actual backstop preventing writes, but this is defense-in-depth missing.
- **Fix A ⭐ Recommended**: Add `"/api/events"` to PROTECTED_ROUTES in middleware.ts
  - Strength: Mirrors the existing middleware pattern; no handler change needed; blocks the request before any DB work.
  - Tradeoff: Future API routes for events also need to be listed explicitly (or the pattern generalised to `/api/`).
  - Confidence: HIGH — identical to how `/dashboard` is protected.
  - Blind spot: None significant.
- **Fix B**: Add `if (!context.locals.user) return context.redirect(...)` at the top of the POST handler
  - Strength: Self-contained; handler doesn't rely on middleware order.
  - Tradeoff: Pattern diverges from how auth pages are guarded; needs to be remembered for every future API route.
  - Confidence: MEDIUM.
  - Blind spot: Doesn't protect future GET endpoints if added.
- **Decision**: FIXED — 3e71b2b — driver_id="" fails Zod uuid validation when car needed but no driver selected

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/events/index.ts:17
- **Detail**: Zod schema has `driver_id: z.uuid().nullable().optional()`. When car_needed is checked and no driver is selected, the browser submits `driver_id=""` (the empty-string `<option value="">`). `z.uuid()` rejects `""` — it is not a UUID, not `null`, and not `undefined`. The user sees "Invalid uuid" instead of a graceful null.
- **Fix**: Replace the driver_id schema field with: `driver_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable().optional())`
- **Decision**: FIXED — 3e71b2b

---

### F3 — listEvents throws on DB error; call site in index.astro has no catch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Reliability
- **Location**: src/pages/events/index.astro:6 + src/lib/services/events.ts:52
- **Detail**: `listEvents` throws `new Error(error.message)` on any Supabase error. The call site `const events = supabase ? await listEvents(supabase) : []` has no try/catch. A transient DB error produces an unhandled rejection and a blank 500 page. Contrast with `new.astro` which uses `.data ?? []` directly and degrades gracefully.
- **Fix**: Wrap the call: `const events = supabase ? await listEvents(supabase).catch(() => []) : [];`
- **Decision**: FIXED — 3e71b2b

---

### F4 — starts_at stored without timezone offset; display round-trips incorrectly

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality / Data Correctness
- **Location**: src/pages/api/events/index.ts:37
- **Detail**: `starts_at = \`${date}T${time}:00\`` produces a naive ISO string (e.g. `2026-06-11T14:30:00`). Supabase stores `TIMESTAMPTZ` and interprets naive literals in the session timezone (UTC on Supabase). A Polish user entering "14:30 CEST" has it stored as `12:30 UTC`. The list page uses `new Date(event.starts_at)` which converts to browser-local time — so the displayed time is incorrect by the timezone offset.
- **Fix A ⭐ Recommended**: Accept UTC as the storage/display convention (MVP single-household, single-timezone): append `Z` — `starts_at = \`${date}T${time}:00Z\``. The display will show UTC time, which matches entry for users in UTC+0 but differs for Polish users (UTC+1/+2). Acceptable for MVP, document the assumption.
  - Strength: Smallest change; consistent storage; no form changes needed.
  - Tradeoff: Polish users see time off by 1–2h if they think in local time.
  - Confidence: HIGH — consistent with the plan's explicit "Timezone conversion — MVP" exclusion.
  - Blind spot: Users adding events in summer (CEST=UTC+2) will see 2h drift vs. winter (CET=UTC+1).
- **Fix B**: Send UTC offset from the browser via a hidden `<input>` in EventForm and apply it server-side.
  - Strength: Correct local times displayed.
  - Tradeoff: Requires EventForm change (client-side JS to compute offset); adds complexity to the POST handler.
  - Confidence: MEDIUM.
  - Blind spot: Offset can change during DST transitions mid-form-fill.
- **Decision**: PENDING

---

### F5 — driver_id null-clearing duplicated in API route and service

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/events/index.ts:38-40 + src/lib/services/events.ts:27
- **Detail**: `driver_id` is cleared to null when `car_needed=false` in two places: in the API route (`resolvedDriverId = car_needed ? (driver_id ?? null) : null`) and again inside `createEvent` (`driver_id: newEvent.car_needed ? newEvent.driver_id : null`). The domain invariant is enforced twice and the two locations can drift.
- **Fix**: Remove the redundant transform from the API route; keep it only in `createEvent` where the invariant belongs.
- **Decision**: PENDING

---

### F6 — listEvents unbounded (no limit/pagination)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Performance
- **Location**: src/lib/services/events.ts:43
- **Detail**: `listEvents` has no `limit`. Acceptable at MVP scale (household = tens of events), but worth noting before the query grows. Plan explicitly excludes pagination for now — this is a known accepted risk.
- **Fix**: No immediate action needed. Add `.limit(200)` as a safety cap, or revisit in S-03/S-04.
- **Decision**: PENDING

---

### F7 — EventForm diverges from SignUpForm pattern (no onSubmit validation, no SubmitButton)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/events/EventForm.tsx
- **Detail**: The canonical form pattern (`SignUpForm.tsx`) uses a `validate()` function on `onSubmit` for client-side feedback before network submission, and imports the shared `<SubmitButton>` component. `EventForm` uses HTML5 `required`/`maxLength` attributes instead and a raw `<button>`. HTML5 validation is functionally correct; the inconsistency will compound as more forms are added.
- **Fix**: Accept as-is for S-01. Consider documenting the two valid form patterns in AGENTS.md, or aligning in a future "form patterns" refactor slice.
- **Decision**: PENDING

---

## Success Criteria Summary

### Automated (all phases)
- ✅ `npm run lint` — PASS
- ✅ `npm run build` — PASS
- ✅ All planned files exist

### Manual (all phases)
- ✅ 1.5 POST valid event → saved in DB
- ✅ 1.6 POST missing title → redirect /events/new?error=...
- ✅ 2.4 /events as authenticated → list renders
- ✅ 2.5 /events as unauthenticated → redirect /auth/signin
- ✅ 2.6 Event visible on list with display_name (not UUID)
- ✅ 2.7 Layout unbroken at 360px
- ✅ 3.5 Full flow: dashboard → list → form → submit → /events?success=1
- ✅ 3.6 Profiles dropdown shows names from DB
- ✅ 3.7 car_needed toggle shows/hides driver dropdown
- ✅ 3.8 HTML5 required blocks submit without title
- ✅ 3.9 Server-side error visible on form via ?error=
- ✅ 3.10 Form layout readable at 360px

## Plan Adherence Summary

7/7 planned files implemented as described. Three minor benign EXTRAs: `car_needed` preprocess also accepts `"true"` and native boolean; `location` shown in events list; back-to-dashboard link on `/events`. None affect scope guardrails.
