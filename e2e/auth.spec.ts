import { expect, test } from "@playwright/test";

test("owner signs in and lands on the dashboard shell", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page
    .getByLabel("Email")
    .fill(process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local");
  await page
    .getByLabel("Password")
    .fill(process.env.E2E_OWNER_PASSWORD ?? "owner-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Your Projects")).toBeVisible();
});

test("wrong password keeps the user on the login page", async ({ page }) => {
  await page.goto("/login");
  await page
    .getByLabel("Email")
    .fill(process.env.E2E_OWNER_EMAIL ?? "owner@spektrum.local");
  await page.getByLabel("Password").fill("definitely not it at all");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("signup without invite is refused and creates no account", async ({ request }) => {
  const res = await request.post("/api/auth/sign-up/email", {
    data: {
      email: "stranger@example.com",
      password: "a long enough password",
      name: "Stranger",
    },
  });
  expect(res.status()).toBe(403);
  const body = await res.json();
  expect(JSON.stringify(body)).toContain("invite_required");
  // no user row was created: signing in with those credentials must fail
  const signIn = await request.post("/api/auth/sign-in/email", {
    data: { email: "stranger@example.com", password: "a long enough password" },
  });
  expect(signIn.status()).toBe(401);
});
