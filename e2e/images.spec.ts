import { execFileSync } from "node:child_process";
import { expect, request as apiRequest, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// End-to-end coverage for image input in chat. The browser downscales and
// re-encodes a pasted PNG, the chat route stores it as an attachment and builds
// a multimodal gateway message, and recent history carries it into follow-ups.
// A fresh thread must go back to a plain-string content payload.

const OWNER_PROJECT = "AI Owner Project";
const MOCK_BASE_URL = "http://localhost:4010";
const MOCK_TOKEN = "test-token";

// 1x1 PNG (68 bytes). Small enough to survive the 1 MiB decoded cap with room
// to spare after the browser re-encodes it.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

type GatewayPart = {
  type: string;
  text?: string;
  image_url?: { url: string };
  detail?: string;
};

type Recorded = {
  body: {
    messages: Array<{ role: string; content: string | GatewayPart[] }>;
  };
};

// Every case shares the seeded owner project; re-seed so cases are independent.
test.beforeEach(() => {
  execFileSync(
    "pnpm",
    [
      "--filter",
      "@spektrum/web",
      "exec",
      "tsx",
      "src/cli/e2e-ai-seed.ts",
      "--reset",
    ],
    { stdio: "inherit", env: process.env },
  );
});

async function openOwnerProject(page: Page): Promise<void> {
  await page.goto("/");
  await login(page);
  await page.getByRole("link", { name: OWNER_PROJECT }).first().click();
  await expect(page.getByTestId("monaco-editor")).toBeVisible({ timeout: 30_000 });
}

async function clearGateway(): Promise<void> {
  const mock = await apiRequest.newContext({ baseURL: MOCK_BASE_URL });
  await mock.delete("/requests", {
    headers: { "x-ai-mock-token": MOCK_TOKEN },
  });
}

async function gatewayRequests(): Promise<Recorded[]> {
  const mock = await apiRequest.newContext({ baseURL: MOCK_BASE_URL });
  const response = await mock.get("/requests", {
    headers: { "x-ai-mock-token": MOCK_TOKEN },
  });
  return (await response.json()) as Recorded[];
}

function lastUserContent(entry: Recorded): string | GatewayPart[] | undefined {
  for (let i = entry.body.messages.length - 1; i >= 0; i -= 1) {
    const message = entry.body.messages[i]!;
    if (message.role === "user") return message.content;
  }
  return undefined;
}

function withText(text: string): (entry: Recorded) => boolean {
  return (entry) => {
    const content = lastUserContent(entry);
    return Array.isArray(content) && content.some((part) => part.text === text);
  };
}

async function pastePng(page: Page): Promise<void> {
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const file = new File([bytes], "pixel.png", { type: "image/png" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    const box = document.querySelector('textarea[aria-label="Ask anything"]');
    if (!box) throw new Error("composer textarea not found");
    box.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, TINY_PNG_BASE64);
}

test("(images) a pasted PNG reaches the gateway, survives a follow-up, and a fresh thread sends a string", async ({
  page,
}) => {
  await openOwnerProject(page);
  await clearGateway();

  const box = page.getByLabel("Ask anything");
  await box.click();
  await pastePng(page);
  await expect(page.getByTestId("pasted-image")).toHaveCount(1);

  await box.fill("describe this image");
  await box.press("Enter");
  await expect(page.getByText("I see the image.")).toBeVisible();

  // The first multimodal turn is one text part plus one image part.
  await expect
    .poll(async () => (await gatewayRequests()).filter(withText("describe this image")).length)
    .toBeGreaterThan(0);
  const first = (await gatewayRequests()).find(withText("describe this image"))!;
  const firstParts = lastUserContent(first) as GatewayPart[];
  expect(firstParts.filter((part) => part.type === "text")).toHaveLength(1);
  expect(firstParts[0]).toEqual({ type: "text", text: "describe this image" });
  const firstImages = firstParts.filter((part) => part.type === "image_url");
  expect(firstImages).toHaveLength(1);
  expect(firstImages[0]!.image_url!.url).toMatch(
    /^data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+$/,
  );
  // Image parts carry only the data URL — never a `detail` field.
  expect(firstParts.every((part) => part.detail === undefined)).toBe(true);

  // A follow-up in the same thread still includes the earlier image.
  await clearGateway();
  await box.fill("and now?");
  await box.press("Enter");
  await expect
    .poll(async () => (await gatewayRequests()).filter(withText("and now?")).length)
    .toBeGreaterThan(0);
  const followUp = (await gatewayRequests()).find(withText("and now?"))!;
  const followUpParts = lastUserContent(followUp) as GatewayPart[];
  expect(followUpParts[0]).toEqual({ type: "text", text: "and now?" });
  expect(followUpParts.filter((part) => part.type === "image_url")).toHaveLength(1);

  // New chat starts a fresh thread: a text-only message is a plain string.
  await clearGateway();
  // The docked chat header sits under Monaco's margin overlay in dev, so a
  // physical click lands on the editor. Dispatch the click on the button itself.
  await page
    .getByTestId("chat-panel")
    .getByRole("button", { name: "New chat" })
    .dispatchEvent("click");
  await expect(page.getByText("Ready when you are!")).toBeVisible();

  await box.fill("just plain text");
  await box.press("Enter");
  await expect
    .poll(async () => {
      const entries = await gatewayRequests();
      return entries.filter((entry) => lastUserContent(entry) === "just plain text")
        .length;
    })
    .toBeGreaterThan(0);
  const plain = (await gatewayRequests()).find(
    (entry) => lastUserContent(entry) === "just plain text",
  )!;
  expect(typeof lastUserContent(plain)).toBe("string");
  expect(JSON.stringify(plain.body)).not.toContain("data:image/");
});
