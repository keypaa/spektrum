import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DashboardClient } from "./dashboard-client";

const markup = renderToStaticMarkup(
  <DashboardClient
    userName="Ada Lovelace"
    userEmail="ada@example.com"
    projects={[]}
    bannerEnabled={false}
  />,
);

describe("dashboard shell", () => {
  it("renders the app root", () => {
    expect(markup).toContain('data-testid="app-root"');
  });

  it("renders the card and the chip as siblings, with the chip after the card", () => {
    const card = markup.indexOf('data-testid="dashboard-card"');
    const cardClose = markup.indexOf("</main>", card);
    const chip = markup.indexOf('data-testid="account-chip"');

    expect(card).toBeGreaterThan(-1);
    expect(cardClose).toBeGreaterThan(card);
    expect(chip).toBeGreaterThan(cardClose);
    // The chip's opening tag is the immediate next element after the card
    // closes, so both are direct children of the app-root wrapper.
    const chipTag = markup.lastIndexOf("<button", chip);
    expect(markup.slice(cardClose + "</main>".length, chipTag)).toBe("");
  });

  it("renders the title exactly once, as 'Your Projects'", () => {
    const headings = [...markup.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
    expect(headings).toHaveLength(1);
    expect(headings[0]?.[1]).toBe("Your Projects");
  });

  it("only renders 16x16 icons", () => {
    const svgs = markup.match(/<svg\b[^>]*>/g) ?? [];
    for (const svg of svgs) {
      expect(svg).toContain('viewBox="0 0 16 16"');
    }
  });
});
