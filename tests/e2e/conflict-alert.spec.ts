// conflict-alert.spec.ts
//
// Risk:    R1 — conflict detection false negative
//          Two overlapping car-flagged events on the same day produce no alert.
// Seed:    tests/e2e/seed.spec.ts
// Source:  context/foundation/test-plan.md §2 R1
//
// What this test proves that unit tests cannot:
//   The conflict banner "⚠ Konflikt auta:" actually renders in the browser
//   after two events are persisted to Supabase and the SSR dashboard fetches them.
//   The unit test proves detectCarConflicts() is correct; this test proves the
//   user sees the result in the running app.
import { test, expect } from "@playwright/test";

// Use today's date in YYYY-MM-DD format (local wall-clock date via ISO string)
const today = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fills the EventForm and submits it.
 * Returns after the redirect to /events has completed.
 */
async function fillAndSubmitEvent(page: import("@playwright/test").Page, title: string, time: string): Promise<void> {
  await page.goto("/events/new");

  await page.getByLabel("Tytuł *").fill(title);

  // Select the first real profile option (index 0 is the "-- wybierz osobę --" placeholder)
  await page.getByLabel("Osoba *").selectOption({ index: 1 });

  await page.getByLabel("Data *").fill(today);
  await page.getByLabel("Godzina *").fill(time);
  await page.getByLabel("Czas trwania (minuty) *").fill("60");

  // Check the car_needed checkbox — this reveals the driver select
  await page.getByLabel("Auto potrzebne").check();

  await page.getByRole("button", { name: "Dodaj wydarzenie" }).click();

  // API redirects to /events?success=1 on success
  await page.waitForURL(/\/events(\?.*)?$/);
}

/**
 * Finds the event card on the /events list by its unique title and returns
 * the event UUID extracted from the "Edytuj" link href.
 */
async function getEventIdByTitle(page: import("@playwright/test").Page, title: string): Promise<string | null> {
  // The events list renders each event in a <li>; find by the unique title text
  const card = page.locator("li").filter({ hasText: title });
  const href = await card.getByRole("link", { name: "Edytuj" }).getAttribute("href");
  // href format: /events/{uuid}/edit
  return href?.match(/\/events\/([^/]+)\/edit/)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test("conflict alert fires on dashboard when two overlapping car-flagged events are created for the same day", async ({
  page,
}) => {
  // Unique suffix prevents collisions on parallel runs or reruns
  const ts = Date.now();
  const titleA = `E2E-Car-A-${ts}`;
  const titleB = `E2E-Car-B-${ts}`;
  const createdIds: string[] = [];

  try {
    // ── Setup ──────────────────────────────────────────────────────────────
    // Event A: 09:00–10:00, car needed
    await fillAndSubmitEvent(page, titleA, "09:00");
    const idA = await getEventIdByTitle(page, titleA);
    if (idA) createdIds.push(idA);

    // Event B: 09:30–10:30, car needed — overlaps A by 30 minutes
    await fillAndSubmitEvent(page, titleB, "09:30");
    const idB = await getEventIdByTitle(page, titleB);
    if (idB) createdIds.push(idB);

    // ── Action ─────────────────────────────────────────────────────────────
    await page.goto("/");

    // ── Assertion ──────────────────────────────────────────────────────────
    // The dashboard SSR fetches events and calls detectCarConflicts().
    // The conflict banner must be visible with both event titles.
    await expect(page.getByText("⚠ Konflikt auta:")).toBeVisible();
    await expect(page.getByText(titleA)).toBeVisible();
    await expect(page.getByText(titleB)).toBeVisible();
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    // Delete both events regardless of test outcome.
    // page.request inherits the authenticated session from storageState.
    for (const id of createdIds) {
      await page.request.post(`/api/events/${id}/delete`).catch(() => {
        // Best-effort; a failed cleanup should not mask a test failure
      });
    }
  }
});
