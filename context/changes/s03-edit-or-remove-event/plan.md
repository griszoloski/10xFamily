# S-03: Edit or Remove an Event — Implementation Plan

## Overview

Implements edit and delete for existing events. After this slice a logged-in parent can open any event in a pre-filled form, change fields and save, or delete it with a two-step inline confirmation. Eliminates the current delete-and-re-add workaround.

## Current State Analysis

- **DB / RLS (F-01 ✓):** `events_update_own` and `events_delete_own` policies already exist in the migration — no migration needed for this slice.
- **Types (F-01 ✓):** `EventUpdate = Partial<NewEvent>` is already defined in `src/types.ts`.
- **PROTECTED_ROUTES:** `"/api/events"` is in the array; `startsWith` matching already covers `/api/events/[id]` and `/api/events/[id]/delete` — no middleware change needed.
- **Service layer (S-01 ✓):** `src/lib/services/events.ts` exposes `getHouseholdId`, `createEvent`, `listEvents` — three new functions will be added.
- **EventForm.tsx (S-01 ✓):** Controlled React component, 175 lines. `carNeeded` state initialized to `false` — needs to accept optional `initialValues` and `eventId` props for edit mode.
- **List page (S-01 ✓):** `/events/index.astro` renders pure Astro event cards — needs edit link and `<DeleteEventButton>` island per card, plus `?updated=1` / `?deleted=1` banners.

## Desired End State

A logged-in user sees Edit and Delete actions on each event card. Clicking Edit navigates to `/events/[id]/edit`, where the form is pre-filled with the event's current values; saving redirects to `/events?updated=1`. Clicking Delete shows a two-step confirmation strip on the card (React island); confirming POSTs to `/api/events/[id]/delete` and redirects to `/events?deleted=1`. All operations are protected by RLS — a user cannot edit or delete another household's events.

### Key Discoveries

- `events_update_own` / `events_delete_own` RLS policies are present in `supabase/migrations/20260610112151_household_events_foundation.sql` — no migration required.
- `EventUpdate = Partial<NewEvent>` is already in `src/types.ts` — the service and API can use it directly.
- `starts_at` is stored as `timestamptz`. S-01 creates it as `${date}T${time}:00` (naive local string). For the pre-fill, extract date as `starts_at.slice(0, 10)` and time as `starts_at.slice(11, 16)` — consistent with the MVP "no timezone conversion" decision.
- `updated_at` has `default now()` but there is **no DB trigger** to auto-update it on `UPDATE`. The `updateEvent` service function must include `updated_at: new Date().toISOString()` in the payload explicitly.
- The Zod update schema is identical to `newEventSchema` in `api/events/index.ts` — same coercions, same constraints.

## What We're NOT Doing

- No soft delete / `deleted_at` column — hard delete per roadmap decision.
- No event detail/view page — edit and delete actions live directly on list cards.
- No optimistic UI or fetch-based updates — all forms use native POST → redirect (same as S-01).
- No bulk delete.
- No conflict detection on edit — that is S-02.
- No timezone conversion — MVP single-timezone household.

## Implementation Approach

Three phases in dependency order: (1) backend — service functions and API endpoints, independently testable before UI exists; (2) edit form extension and edit page; (3) list page additions (edit links, delete island, success banners). Each phase ends with lint + build before proceeding.

## Critical Implementation Details

**`updated_at` must be set manually.** The `events` table has `updated_at timestamptz not null default now()` but no `BEFORE UPDATE` trigger. Omitting it from the UPDATE payload leaves `updated_at` unchanged. The `updateEvent` service function must merge `updated_at: new Date().toISOString()` into every update call.

**`starts_at` slicing for edit pre-fill.** Supabase returns `starts_at` as a UTC ISO string (e.g. `"2026-06-20T09:00:00+00:00"`). The create form builds it as a naive local string `"2026-06-20T09:00:00"`. For the edit form, extract date and time with simple string slicing (`starts_at.slice(0, 10)`, `starts_at.slice(11, 16)`) — this preserves the MVP "no timezone conversion" invariant. Do not use `new Date(starts_at)` which would apply local-timezone offset.

**`getEvent` ownership is enforced by RLS.** The function does a plain `SELECT … WHERE id = $1`. If the event belongs to another household, RLS returns zero rows and the function returns `null`. The edit page must redirect to `/events` when `null` is returned — this is the 404/403 handler.

---

## Phase 1: Service layer + API endpoints

### Overview

Adds three service functions to `events.ts` and creates two POST API routes: one for update, one for delete. After this phase the backend is testable independently of the UI (curl or Supabase Studio).

### Changes Required

#### 1. Service — `getEvent`, `updateEvent`, `deleteEvent`

**File:** `src/lib/services/events.ts`

**Intent:** Extend the existing service with three new exported functions that cover the read-single, update, and delete operations. All three accept `SupabaseClient` as the first argument — consistent with the existing service contract.

**Contract:**

- `getEvent(supabase, eventId: string): Promise<Event | null>` — SELECT from `events` WHERE `id = eventId`. RLS filters cross-household rows; returns `null` if not found or inaccessible.
- `updateEvent(supabase, eventId: string, update: EventUpdate): Promise<Event>` — UPDATE `events` SET `{ ...update, updated_at: new Date().toISOString() }` WHERE `id = eventId`, SELECT the updated row. Throws if the update returns no row.
- `deleteEvent(supabase, eventId: string): Promise<void>` — DELETE FROM `events` WHERE `id = eventId`. Throws if Supabase returns an error.

#### 2. API route — POST `/api/events/[id]` (update)

**File:** `src/pages/api/events/[id].ts`

**Intent:** Accept the edit form submission, validate with Zod (same schema as the create endpoint), call `updateEvent`, redirect on success or error. Mirrors the structure of `src/pages/api/events/index.ts`.

**Contract:** Exports `POST: APIRoute`. Sequence:
1. `createClient` → null guard → redirect `/events/${id}/edit?error=…`.
2. `context.params.id` — used as `eventId` throughout.
3. `request.formData()` → parse with the same `updateEventSchema` (same shape as `newEventSchema`). On Zod failure → redirect `/events/${id}/edit?error=<first_issue>`.
4. Build `starts_at = \`${date}T${time}:00\``, resolve `driver_id` to null when `car_needed === false`.
5. `updateEvent(supabase, eventId, payload)` — on thrown error → redirect `/events/${id}/edit?error=…`.
6. Success → redirect `/events?updated=1`.

#### 3. API route — POST `/api/events/[id]/delete` (delete)

**File:** `src/pages/api/events/[id]/delete.ts`

**Intent:** Accept the delete confirmation form submission and permanently remove the event. No request body is needed — the event ID comes from the URL param.

**Contract:** Exports `POST: APIRoute`. Sequence:
1. `createClient` → null guard → redirect `/events?error=…`.
2. `deleteEvent(supabase, context.params.id)` — on error → redirect `/events?error=…`.
3. Success → redirect `/events?deleted=1`.

### Success Criteria

#### Automated Verification

- `src/lib/services/events.ts` exports `getEvent`, `updateEvent`, `deleteEvent`
- `src/pages/api/events/[id].ts` exports `POST`
- `src/pages/api/events/[id]/delete.ts` exports `POST`
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification

- PATCH via Supabase Studio: update a row in `events`, confirm `updated_at` changes.
- POST to `/api/events/<valid-id>` with correct formData → event updated in Studio.
- POST to `/api/events/<valid-id>/delete` → row removed from Studio.
- POST to `/api/events/<other-household-id>` → event not updated (RLS blocks it, redirect with error).

**Implementation Note:** After Phase 1 passes all automated + manual tests, pause for confirmation before proceeding to Phase 2.

---

## Phase 2: Edit form extension + edit page

### Overview

Extends `EventForm.tsx` to support edit mode (pre-filled values, different action URL, different button label) and creates the `/events/[id]/edit.astro` page.

### Changes Required

#### 1. Extend `EventForm.tsx` for edit mode

**File:** `src/components/events/EventForm.tsx`

**Intent:** Add two optional props (`initialValues` and `eventId`) that switch the form into edit mode: pre-fill all inputs, point `action` at `/api/events/${eventId}`, and change the submit button label.

**Contract:**

New props (added to existing `Props` interface):
```ts
interface InitialValues {
  title: string;
  subject_id: string;
  date: string;           // YYYY-MM-DD, pre-sliced from starts_at
  time: string;           // HH:MM, pre-sliced from starts_at
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  car_needed: boolean;
  driver_id: string | null;
}

// added to existing Props:
initialValues?: InitialValues;
eventId?: string;
```

Behaviour changes when both props are present:
- `<form action>` becomes `/api/events/${eventId}` (create mode keeps `/api/events`).
- `useState(false)` for `carNeeded` becomes `useState(initialValues?.car_needed ?? false)`.
- All `<input>` and `<select>` elements receive `defaultValue` from `initialValues` (for uncontrolled fields) or correct initial state (for the controlled `carNeeded` checkbox).
- Submit button label: "Zapisz zmiany" in edit mode, "Dodaj wydarzenie" in create mode.

#### 2. Edit page `/events/[id]/edit.astro`

**File:** `src/pages/events/[id]/edit.astro`

**Intent:** SSR page that fetches the event by ID, builds the `InitialValues` object for the form, and renders the extended `EventForm` in edit mode. Redirects to `/events` if the event is not found or inaccessible (RLS `null` return).

**Contract:** Astro frontmatter:
- `createClient` → `getEvent(supabase, Astro.params.id)` → if `null`, `return Astro.redirect("/events")`.
- Build `initialValues`: extract `date = event.starts_at.slice(0, 10)`, `time = event.starts_at.slice(11, 16)`, map remaining fields directly.
- `supabase.from("household_members_profiles").select("id, display_name, kind").order("display_name")` → `profiles`.
- `const error = Astro.url.searchParams.get("error")`.
- Render `<EventForm profiles={profiles} initialValues={initialValues} eventId={event.id} error={error} client:load />`.
- Layout: `<Layout title="Edytuj wydarzenie">`.

### Success Criteria

#### Automated Verification

- `src/pages/events/[id]/edit.astro` exists
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification

- Navigate to `/events/<valid-id>/edit` as logged-in user → form loads with all fields pre-filled.
- `car_needed` is `true` on the event → driver dropdown is visible and pre-selected.
- `car_needed` is `false` → driver dropdown not present in DOM.
- Submit with a changed title → redirected to `/events?updated=1`; updated event visible on list.
- Submit with `duration_minutes=0` → redirected back with `?error=…` message visible.
- Navigate to `/events/<other-household-event-id>/edit` → redirected to `/events` (RLS blocks).
- Navigate to `/events/edit` as logged-out user → redirected to `/auth/signin`.

**Implementation Note:** After Phase 2 passes all automated + manual tests, pause for confirmation before Phase 3.

---

## Phase 3: List page — edit links, delete island, success banners

### Overview

Creates the `DeleteEventButton.tsx` React island (two-step confirm strip) and updates `/events/index.astro` to add Edit links, mount the delete island per card, and show `?updated=1` / `?deleted=1` banners.

### Changes Required

#### 1. `DeleteEventButton.tsx` React island

**File:** `src/components/events/DeleteEventButton.tsx`

**Intent:** Encapsulate the two-step delete confirmation. Clicking "Usuń" reveals a confirm strip ("Na pewno usunąć?") with "Tak, usuń" (submits a POST form to `/api/events/${eventId}/delete`) and "Anuluj" (resets to initial state). No page navigation until the form is submitted.

**Contract:**

Props:
```ts
interface Props {
  eventId: string;
}
```

State: `const [confirming, setConfirming] = useState(false)`.

Render:
- `confirming === false`: renders a single "Usuń" `<button type="button" onClick={() => setConfirming(true)}>`.
- `confirming === true`: renders a small strip — "Na pewno usunąć?" text, a `<form method="POST" action={/api/events/${eventId}/delete}>` containing a submit button "Tak, usuń", and a separate `<button type="button" onClick={() => setConfirming(false)}>Anuluj</button>`.

#### 2. Update `/events/index.astro`

**File:** `src/pages/events/index.astro`

**Intent:** Add edit/delete actions per event card and show success banners for update and delete results.

**Contract:**
- Import `DeleteEventButton` and render `<DeleteEventButton eventId={event.id} client:load />` inside each `<li>`.
- Add an Edit link (`<a href={/events/${event.id}/edit}>Edytuj</a>`) per card, alongside the delete island.
- Read `const deletedMsg = Astro.url.searchParams.get("deleted") === "1"` and `const updatedMsg = Astro.url.searchParams.get("updated") === "1"` in the frontmatter; render the matching banner (same style as the existing `successMsg` banner for `?success=1`).

### Success Criteria

#### Automated Verification

- `src/components/events/DeleteEventButton.tsx` exists
- `npm run lint` passes
- `npm run build` passes

#### Manual Verification

- `/events` list: each card shows "Edytuj" link and "Usuń" button.
- Click "Usuń" → confirm strip appears; "Anuluj" hides it again without navigating.
- Click "Tak, usuń" in confirm strip → event deleted, redirected to `/events?deleted=1`, banner visible.
- Click "Edytuj" → `/events/[id]/edit` with pre-filled form; after saving → `/events?updated=1`, banner visible.
- Layout intact at 360px (DevTools mobile view) — action buttons don't overflow card.
- No JS: with JS disabled, "Usuń" button does not submit (it's `type="button"`), so accidental deletes are prevented without JS. Edit link still works (pure `<a>`).

---

## Testing Strategy

### Unit Tests

No pure algorithmic logic introduced in S-03 — all logic is Zod validation (covered by lint+build) and Supabase call plumbing. Unit tests deferred per `main_goal: learn` / `top_blocker: time` policy established in S-01.

### Manual Testing Steps

1. Create an event via `/events/new`.
2. Navigate to its edit page, change the title, save → verify updated title on `/events`.
3. Toggle `car_needed` on the edit form — verify driver dropdown shows/hides.
4. Set `duration_minutes` to 0 on edit form → verify error banner redirects back with message.
5. On `/events`, click "Usuń" → confirm strip appears. Click "Anuluj" → strip disappears.
6. Click "Usuń" again → click "Tak, usuń" → event removed, deleted banner shown.
7. Try navigating to another household's event edit URL → verify redirect to `/events`.

## Performance Considerations

`getEvent` fetches a single row by primary key — minimal load. `updateEvent` and `deleteEvent` are single-row mutations. No N+1 risk. `DeleteEventButton` is a tiny React island (< 50 lines) — negligible hydration cost.

## Migration Notes

No migration required. `events_update_own` and `events_delete_own` RLS policies were shipped with F-01.

## References

- Roadmap S-03: `context/foundation/roadmap.md`
- PRD: `context/foundation/prd.md` (FR-004, FR-005)
- F-01 migration: `supabase/migrations/20260610112151_household_events_foundation.sql`
- Types: `src/types.ts` (`EventUpdate`, `Event`, `NewEvent`, `HouseholdMemberProfile`)
- Service to extend: `src/lib/services/events.ts`
- API pattern reference: `src/pages/api/events/index.ts`
- Form pattern reference: `src/components/events/EventForm.tsx`
- S-01 plan: `context/changes/s01-first-event-in-schedule/plan.md`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Service layer + API endpoints

#### Automated

- [x] 1.1 `events.ts` exports `getEvent`, `updateEvent`, `deleteEvent`
- [x] 1.2 `src/pages/api/events/[id].ts` exports `POST`
- [x] 1.3 `src/pages/api/events/[id]/delete.ts` exports `POST`
- [x] 1.4 `npm run lint` passes
- [x] 1.5 `npm run build` passes

#### Manual

- [ ] 1.6 `updated_at` changes on UPDATE verified in Supabase Studio
- [ ] 1.7 POST update endpoint works end-to-end via formData
- [ ] 1.8 POST delete endpoint removes row from Studio
- [ ] 1.9 Cross-household update blocked by RLS

### Phase 2: Edit form extension + edit page

#### Automated

- [x] 2.1 `src/pages/events/[id]/edit.astro` exists
- [x] 2.2 `npm run lint` passes
- [x] 2.3 `npm run build` passes

#### Manual

- [ ] 2.4 Edit page loads with all fields pre-filled
- [ ] 2.5 `car_needed` state initialized correctly from existing event
- [ ] 2.6 Edit submit succeeds → `/events?updated=1`
- [ ] 2.7 Validation error redirects back with `?error=` message
- [ ] 2.8 Cross-household event URL redirects to `/events`
- [ ] 2.9 Unauthenticated access redirects to `/auth/signin`

### Phase 3: List page — edit links, delete island, banners

#### Automated

- [x] 3.1 `src/components/events/DeleteEventButton.tsx` exists
- [x] 3.2 `npm run lint` passes
- [x] 3.3 `npm run build` passes

#### Manual

- [ ] 3.4 Edit link and Usuń button visible on each event card
- [ ] 3.5 Two-step confirm strip shows/hides correctly
- [ ] 3.6 Delete flow completes → `/events?deleted=1` banner
- [ ] 3.7 Update flow completes → `/events?updated=1` banner
- [ ] 3.8 Layout intact at 360px
