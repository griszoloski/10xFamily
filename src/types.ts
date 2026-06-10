// ============================================================================
// Domain types for the 10xFamily Schedule Hub.
// ----------------------------------------------------------------------------
// Hand-mirrored 1:1 to the schema in
// supabase/migrations/20260610112151_household_events_foundation.sql.
// Boundary validation lives in slice-level Zod schemas (S-01..S-04), not here.
// ============================================================================

export interface Household {
  id: string;
  created_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  joined_at: string;
}

export interface HouseholdMemberProfile {
  id: string;
  household_id: string;
  display_name: string;
  kind: "adult" | "child";
  created_at: string;
}

export interface Event {
  id: string;
  household_id: string;
  subject_id: string;
  driver_id: string | null;
  title: string;
  starts_at: string;
  duration_minutes: number;
  location: string | null;
  notes: string | null;
  car_needed: boolean;
  created_at: string;
  updated_at: string;
}

// DTO for S-01: insert. household_id is set server-side from the caller's
// household_members row; id, created_at, updated_at are DB-managed.
export type NewEvent = Omit<Event, "id" | "household_id" | "created_at" | "updated_at">;

// DTO for S-03: partial update of any user-editable field.
export type EventUpdate = Partial<NewEvent>;
