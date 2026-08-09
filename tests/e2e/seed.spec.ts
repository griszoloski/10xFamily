// seed.spec.ts — exemplar for this project.
//
// This file is a QUALITY LEVER, not a production test.
// Every generated E2E test should be modeled on the patterns shown here:
//   1. Role-based locators (getByRole, getByLabel, getByText)
//   2. Test independence: own setup → action → assertion → cleanup in one test
//   3. Wait for state, not time (toBeVisible, waitForURL — never waitForTimeout)
//   4. Risk-tied assertion name (what breaks if the risk materialises)
//
// Reference: tests/e2e/auth.setup.ts handles authentication.
// The storageState is injected automatically via playwright.config.ts.
import { test, expect } from "@playwright/test";

// Dashboard smoke — confirms auth + routing + basic SSR are all working.
// Not a named test-plan risk; this is the seed/exemplar only.
test("authenticated user lands on dashboard with today and upcoming sections visible", async ({ page }) => {
  await page.goto("/");

  // Role-based locators — robust against CSS and layout changes
  await expect(page.getByRole("heading", { name: "Dashboard Dziś" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dziś" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Najbliższe 7 dni" })).toBeVisible();

  // Navigation links exist
  await expect(page.getByRole("link", { name: "+ Dodaj wydarzenie" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Wszystkie wydarzenia" })).toBeVisible();
});
