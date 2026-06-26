import type { APIRoute } from "astro";
import { z } from "zod";
import { createClient } from "@/lib/supabase";
import { deleteEvent } from "@/lib/services/events";

export const POST: APIRoute = async (context) => {
  const idParsed = z.uuid().safeParse(context.params.id);
  if (!idParsed.success) {
    return new Response("Not Found", { status: 404 });
  }
  const eventId = idParsed.data;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/events?error=${encodeURIComponent("Supabase not configured")}`);
  }

  try {
    await deleteEvent(supabase, eventId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete event";
    return context.redirect(`/events?error=${encodeURIComponent(message)}`);
  }

  return context.redirect("/events?deleted=1");
};
