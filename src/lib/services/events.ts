import type { SupabaseClient } from "@supabase/supabase-js";
import type { Event, HouseholdMemberProfile, NewEvent } from "@/types";

export interface EventWithProfiles extends Event {
  subject: Pick<HouseholdMemberProfile, "id" | "display_name" | "kind">;
  driver: Pick<HouseholdMemberProfile, "id" | "display_name"> | null;
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
