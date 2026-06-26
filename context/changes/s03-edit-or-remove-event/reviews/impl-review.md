<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-03 Edit or Remove an Event

- **Plan**: context/changes/s03-edit-or-remove-event/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-26
- **Verdict**: NEEDS ATTENTION
- **Findings**: 1 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS ✅ |
| Scope Discipline | PASS ✅ (1 justified EXTRA) |
| Safety & Quality | FAIL ❌ (1 critical, 4 warnings) |
| Architecture | PASS ✅ |
| Pattern Consistency | WARNING ⚠️ (2 observations) |
| Success Criteria | PASS ✅ |

## Findings

### F1 — Silent false success on delete

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/events.ts:143–149
- **Detail**: `deleteEvent` performs no rows-affected check. Supabase `.delete()` returns no error when zero rows are matched (event doesn't exist or RLS filtered it). The API route then unconditionally redirects to `/events?deleted=1`, showing a false success banner. Compare with `updateEvent` (lines 131–138) which uses `.select().single()` and correctly throws on zero rows.
- **Fix**: Chain `.select("id")` on the delete query and assert at least one row was returned:
  ```typescript
  const { data, error } = await supabase
    .from("events").delete().eq("id", eventId).select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Event not found or already deleted");
  ```
  - Strength: Makes delete consistent with updateEvent; eliminates false success UX.
  - Tradeoff: Minimal — one function, 3-line change.
  - Confidence: HIGH — updateEvent already uses this pattern.
  - Blind spot: None significant.
- **Decision**: FIXED — added `.select("id")` + `data.length === 0` check

### F2 — `eventId` route param not UUID-validated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/events/[id]/delete.ts:6, src/pages/api/events/[id].ts:19
- **Detail**: Both endpoints consume the URL route param raw (`context.params.id ?? ""`) with no format validation. An empty string or arbitrary value is passed directly into Supabase. All user-supplied field values are Zod-validated; the URL param, also user-controlled, is not. Compounds F1 on the delete route: invalid ID + no rows-affected check = false success.
- **Fix**: Add `z.string().uuid().safeParse(context.params.id)` as the first step in both handlers; return 404 on failure.
- **Decision**: FIXED — added `z.uuid().safeParse(context.params.id)` in both [id].ts and [id]/delete.ts

### F3 — No application-layer ownership filter on update and delete

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/events.ts:125–149
- **Detail**: Neither `updateEvent` nor `deleteEvent` filters by `household_id`. Both rely entirely on Supabase RLS for authorization. By contrast, `createEvent` explicitly injects `household_id` in the INSERT payload. If RLS is misconfigured in a future migration or a service-role key is used, any authenticated user could update/delete any event by guessing its UUID.
- **Fix A ⭐ Recommended**: Add explicit `.eq("household_id", householdId)` to both queries (reuse `getHouseholdId`).
  - Strength: Defense-in-depth; consistent with createEvent pattern; catches RLS misconfigurations.
  - Tradeoff: One extra DB round-trip per operation for `getHouseholdId`.
  - Confidence: HIGH — getHouseholdId is already used in createEvent.
  - Blind spot: getHouseholdId itself has no caching; minor performance cost.
- **Fix B**: Document the RLS-only approach with an explicit code comment citing policy names.
  - Strength: Zero code change; zero performance cost.
  - Tradeoff: Security boundary is invisible; breaks silently on RLS misconfiguration.
  - Confidence: MEDIUM — depends on RLS never being misconfigured.
  - Blind spot: Future developers may not read the comment before adding a service-role shortcut.
- **Decision**: FIXED via Fix B — added code comments on updateEvent and deleteEvent citing specific RLS policy names

### F4 — Unbounded event list fetch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/events/index.astro:9
- **Detail**: `listEvents` fetches all events with no LIMIT, no date window, no pagination. As a household accumulates events over months/years, every page load transfers and renders an ever-growing payload through the Cloudflare Worker. The service already provides `listEventsByDateRange` (lines 87–110).
- **Fix**: Replace `listEvents` call with `listEventsByDateRange(supabase, from, to)` using e.g. past 30 days + next 90 days window.
- **Decision**: SKIPPED — household is small; will revisit if app goes public

### F5 — No CSRF protection on destructive form POSTs

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/components/events/DeleteEventButton.tsx:27, src/components/events/EventForm.tsx:32
- **Detail**: Both destructive operations submit via plain HTML forms with no CSRF token. A malicious third-party page can submit a form targeting `/api/events/<id>/delete`. Protection relies entirely on `SameSite=Lax` cookie behavior, which is browser-enforced and depends on Supabase's cookie-setting config.
- **Fix A ⭐ Recommended**: Migrate delete and update form submissions to `fetch(..., { method: "POST", credentials: "include" })` calls in React. Cross-origin `fetch` with credentials is blocked by CORS by default — eliminates the CSRF vector without token management overhead.
  - Strength: No new secrets/infrastructure; aligns with React island UX (can show optimistic feedback).
  - Tradeoff: More code in components; error handling in JS.
  - Confidence: MED — requires CORS headers to be correctly set on the API routes.
  - Blind spot: CORS config on Cloudflare Workers not verified.
- **Fix B**: Add HMAC-signed nonce to each form + validate in API routes.
  - Strength: Works with native form POST; no CORS dependency.
  - Tradeoff: Requires `CSRF_SECRET` env var, nonce generation, cookie + hidden field, validation logic.
  - Confidence: HIGH — standard CSRF defense.
  - Blind spot: Implementation complexity higher; nonce expiry logic needed.
- **Decision**: SKIPPED — SameSite=Lax sufficient for private MVP household

### F6 — Delete endpoint has no Zod validation (pattern inconsistency)

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/events/[id]/delete.ts (entire file)
- **Detail**: Only API route in the events namespace with no Zod schema. Both siblings (`index.ts`, `[id].ts`) define explicit schemas and call `safeParse`. This makes the route harder to audit and breaks the team's validation convention. Note: resolving F2 (UUID param validation) would already require adding Zod to this file.
- **Fix**: Add a minimal `paramsSchema = z.object({ id: z.string().uuid() })` and validate as first step (overlaps with F2 fix).
- **Decision**: ACCEPTED-AS-RULE — F2 fix already added z.uuid() validation; lesson recorded

### F7 — Inline Supabase query in `edit.astro` bypasses service layer

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/events/[id]/edit.astro:31–32
- **Detail**: Profile fetch is written directly against the Supabase client in the Astro frontmatter (`supabase.from("household_members_profiles")...`), not via a service function. Inconsistent with all other DB calls in this file and the codebase. Also: `?? []` silently swallows errors — if the query fails, `profiles` is empty with no redirect or error surface.
- **Fix**: Extract `listHouseholdProfiles` into a service function; handle error with redirect.
- **Decision**: FIXED — extracted listHouseholdProfiles to service layer; edit.astro redirects on fetch error

### F8 — `updated_at` stamped in application layer

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/events.ts:128
- **Detail**: `updated_at: new Date().toISOString()` is set manually in every update payload. Any future UPDATE that forgets this line will leave `updated_at` stale. A Postgres `BEFORE UPDATE` trigger is the canonical solution.
- **Fix A ⭐ Recommended**: Keep the current app-layer approach but document with a comment `// DB has no trigger; must be set manually per plan.md key discoveries`. This is low-risk for current scale.
  - Strength: Zero migration required; no risk of breaking change.
  - Tradeoff: Future UPDATE functions must remember to include it.
  - Confidence: HIGH — consistent with plan's explicit note that this is intentional.
  - Blind spot: Will be painful if service layer grows to 10+ update paths.
- **Fix B**: Add a `BEFORE UPDATE` trigger in a new migration and remove the app-layer assignment.
  - Strength: Canonical; eliminates the class of bug entirely.
  - Tradeoff: Requires a new migration; slight scope expansion.
  - Confidence: HIGH — standard Postgres pattern.
  - Blind spot: Need to verify the trigger doesn't conflict with RLS policies.
- **Decision**: FIXED via Fix A — added inline comment documenting manual updated_at requirement
