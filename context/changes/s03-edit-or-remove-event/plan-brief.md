# S-03: Edit or Remove an Event — Plan Brief

> Full plan: `context/changes/s03-edit-or-remove-event/plan.md`

## What & Why

Implements edit and hard-delete for existing events. Currently a parent who misspells a title or changes a time must delete and re-add the event manually — this slice removes that friction by adding proper edit and delete flows.

## Starting Point

S-01 delivered: event creation form (`EventForm.tsx`), list page (`/events`), POST API endpoint, and the `events.ts` service layer. The DB already has `events_update_own` and `events_delete_own` RLS policies (F-01). `EventUpdate = Partial<NewEvent>` is already in `src/types.ts`. Nothing blocks writing the update/delete logic today.

## Desired End State

Each event card on `/events` shows an Edit link and a Delete button. Edit opens a pre-filled form at `/events/[id]/edit`; saving redirects to `/events?updated=1`. Delete shows a two-step confirm strip inline; confirming permanently removes the event and redirects to `/events?deleted=1`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Delete strategy | Hard delete | PRD doesn't require audit trail; simpler for MVP. | Plan |
| Delete confirmation | Two-step inline React island | Prevents accidental taps without extra pages; follows existing React island pattern. | Plan |
| Edit form reuse | Extend `EventForm.tsx` with optional `initialValues` + `eventId` | Avoids ~175 lines of duplication; minimal added complexity. | Plan |
| Edit/delete entry point | Directly on list cards | Minimum clicks for a small family list; no detail page needed at this scale. | Plan |
| API structure | Two separate POST endpoints (`/api/events/[id]` + `/api/events/[id]/delete`) | Each file does one thing; consistent with existing POST-only pattern, no method-dispatch magic. | Plan |
| Timezone handling | Slice `starts_at` string directly | Preserves S-01's "no timezone conversion" MVP invariant. | Plan |

## Scope

**In scope:**
- `getEvent`, `updateEvent`, `deleteEvent` service functions
- POST `/api/events/[id]` (update) and POST `/api/events/[id]/delete` (delete) API routes
- `/events/[id]/edit.astro` edit page
- Extended `EventForm.tsx` (optional edit-mode props)
- `DeleteEventButton.tsx` React island (two-step confirm)
- `/events/index.astro` updated with edit link, delete island, and banners for `?updated=1` / `?deleted=1`

**Out of scope:**
- Soft delete / `deleted_at` column
- Event detail/view page
- Conflict detection on edit (S-02)
- Timezone conversion
- Bulk delete

## Architecture / Approach

Pure SSR + React islands, identical to S-01. API routes accept form POST and redirect on success or error. `EventForm.tsx` gains two optional props; when present it switches to edit mode (pre-filled inputs, different action URL, different button label). Delete is handled by a small React island (`DeleteEventButton.tsx`) that reveals a confirm strip — the actual deletion is a native form POST. No fetch/JSON anywhere.

One non-obvious constraint: `updated_at` has no DB trigger, so `updateEvent` must set it explicitly in every UPDATE payload.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Service layer + API endpoints | `getEvent` / `updateEvent` / `deleteEvent` in `events.ts`; two POST API routes | `updated_at` forgotten → silently stale timestamps |
| 2. Edit form + edit page | Extended `EventForm.tsx`; `/events/[id]/edit.astro` | `starts_at` slicing off-by-one → wrong pre-filled date/time |
| 3. List page additions | `DeleteEventButton.tsx` island; edit links; banners on `/events` | S-02 parallel branch may modify same `index.astro` → manual merge |

**Prerequisites:** S-01 complete (confirmed). No migration needed.  
**Estimated effort:** ~1–2 sessions across 3 phases.

## Open Risks & Assumptions

- S-02 runs in parallel and also touches `/events/index.astro` — the Phase 3 merge will require manual reconciliation (S-02 adds a conflict alert banner above the list; S-03 adds per-card actions inside the list — non-overlapping sections but same file).
- `starts_at` is stored as UTC ISO string; slicing `[0:10]` / `[11:16]` is correct only if Supabase returns the string in the format `YYYY-MM-DDTHH:MM:SS±offset`. Verified against S-01 behavior.

## Success Criteria (Summary)

- Parent can edit any field of an existing event and see the update reflected on the list immediately.
- Parent can delete an event with a two-step confirmation; deleted events no longer appear on the list.
- Attempting to edit or delete another household's event is silently blocked (RLS) and redirects to `/events`.
