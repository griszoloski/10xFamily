// auth.setup.ts — saves an authenticated session to playwright/.auth/user.json
// Run once before the test suite; reused by all tests via storageState.
//
// Required env vars (add to .dev.vars or .env.test):
//   E2E_EMAIL    — email of an existing Supabase test user
//   E2E_PASSWORD — password of that user
import { test as setup, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.join(__dirname, "../../playwright/.auth/user.json");

setup("authenticate as test user", async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_EMAIL and E2E_PASSWORD env vars must be set before running E2E tests.\n" +
        "Add them to .dev.vars (Cloudflare local dev) or export them in the shell.",
    );
  }

  await page.goto("/auth/signin");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Supabase auth sets cookies on redirect — wait for the dashboard to confirm
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { name: "Dashboard Dziś" })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
