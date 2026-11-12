import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
export const OWNER_PASSWORD =
  process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";

/**
 * Shared sign-in for the behavioural e2e suite. Each test gets a fresh
 * x-forwarded-for so the sign-in rate limit (5 / 15 min / IP) never trips.
 */
export async function login(page: Page): Promise<void> {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();
}