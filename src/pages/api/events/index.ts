import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { createEvent, getHouseholdId } from "@/lib/services/events";

const newEventSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  subject_id: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  duration_minutes: z.coerce.number().int().min(1).max(1440),
  location: z.string().max(300).optional(),
  notes: z.string().max(2000).optional(),
  car_needed: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()).default(false),
  driver_id: z.uuid().nullable().optional(),
});

export const POST: APIRoute = async (context) => {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/events/new?error=${encodeURIComponent("Supabase not configured")}`);
  }

  const formData = await context.request.formData();
  const raw = Object.fromEntries(formData);

  const parsed = newEventSchema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid form data";
    return context.redirect(`/events/new?error=${encodeURIComponent(message)}`);
  }

  const { date, time, car_needed, driver_id, ...rest } = parsed.data;
  const starts_at = `${date}T${time}:00`;
  const resolvedDriverId = car_needed ? (driver_id ?? null) : null;

  const householdId = await getHouseholdId(supabase);
  if (!householdId) {
    return context.redirect(`/events/new?error=${encodeURIComponent("No household found for this user")}`);
  }

  try {
    await createEvent(supabase, householdId, {
      ...rest,
      starts_at,
      car_needed,
      driver_id: resolvedDriverId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create event";
    return context.redirect(`/events/new?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/events?success=1");
};
