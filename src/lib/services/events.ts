import type { SupabaseClient } from "@supabase/supabase-js";
import type { Event, EventUpdate, HouseholdMemberProfile, NewEvent } from "@/types";

export interface EventWithProfiles extends Event {
  subject: Pick<HouseholdMemberProfile, "id" | "display_name" | "kind">;
  driver: Pick<HouseholdMemberProfile, "id" | "display_name"> | null;
}

export interface ConflictPair {
  a: EventWithProfiles;
  b: EventWithProfiles;
}

export function detectCarConflicts(events: EventWithProfiles[]): ConflictPair[] {
  const carEvents = events.filter((e) => e.car_needed);
  const pairs: ConflictPair[] = [];

  for (let i = 0; i < carEvents.length; i++) {
    for (let j = i + 1; j < carEvents.length; j++) {
      const a = carEvents[i];
      const b = carEvents[j];

      if (a.starts_at.slice(0, 10) !== b.starts_at.slice(0, 10)) continue;

      const aStart = new Date(a.starts_at).getTime();
      const aEnd = aStart + a.duration_minutes * 60_000;
      const bStart = new Date(b.starts_at).getTime();
      const bEnd = bStart + b.duration_minutes * 60_000;

      if (aStart < bEnd && bStart < aEnd) {
        pairs.push({ a, b });
      }
    }
  }

  return pairs;
}

export async function getHouseholdId(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from("household_members").select("household_id").limit(1).single();

  if (error) {
    return null;
  }

  return data.household_id as string;
}

export async function createEvent(supabase: SupabaseClient, householdId: string, newEvent: NewEvent): Promise<Event> {
  const payload = {
    ...newEvent,
    household_id: householdId,
    driver_id: newEvent.car_needed ? newEvent.driver_id : null,
  };

  const { data, error } = (await supabase.from("events").insert(payload).select().single()) as {
    data: Event | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create event");
  }

  return data;
}

export async function listEvents(supabase: SupabaseClient): Promise<EventWithProfiles[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      `
      *,
      subject:household_members_profiles!subject_id(id, display_name, kind),
      driver:household_members_profiles!driver_id(id, display_name)
    `,
    )
    .order("starts_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data as EventWithProfiles[];
}

export async function listEventsByDateRange(
  supabase: SupabaseClient,
  from: string,
  to: string,
): Promise<EventWithProfiles[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      `
      *,
      subject:household_members_profiles!subject_id(id, display_name, kind),
      driver:household_members_profiles!driver_id(id, display_name)
    `,
    )
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data as EventWithProfiles[];
}

export async function getEvent(supabase: SupabaseClient, eventId: string): Promise<Event | null> {
  const { data, error } = (await supabase.from("events").select("*").eq("id", eventId).single()) as {
    data: Event | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    return null;
  }

  return data;
}

export async function updateEvent(supabase: SupabaseClient, eventId: string, update: EventUpdate): Promise<Event> {
  const payload = {
    ...update,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = (await supabase.from("events").update(payload).eq("id", eventId).select().single()) as {
    data: Event | null;
    error: { message: string } | null;
  };

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update event");
  }

  return data;
}

export async function deleteEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) {
    throw new Error(error.message);
  }
}
