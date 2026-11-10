import { expect, type Page } from "@playwright/test";

export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local";
export const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD ?? "owner-password-123";
export const THEME_KEY = "crixet_light_mode_preference_v1";

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "Your Projects" })).toBeVisible();
  await movePointerAway(page);
}

/**
 * Park the pointer on the page background (inside the p-2 gutter, left of the
 * card). Every reference captures the dashboard with **no** hovered row and no
 * highlighted menu item, so the pointer must be moved away before screenshotting:
 * the click that opened a menu leaves the pointer inside its first item, and the
 * click that submitted the login form leaves it over the middle of the card.
 */
export async function movePointerAway(page: Page): Promise<void> {
  await page.mouse.move(4, 600);
}

export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [THEME_KEY, theme],
  );
}
