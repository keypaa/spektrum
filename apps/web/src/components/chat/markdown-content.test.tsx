// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownContent } from "./markdown-content";

afterEach(cleanup);

describe("MarkdownContent", () => {
  it("renders markdown and typesets LaTeX", () => {
    render(
      <MarkdownContent
        content={"**Pay attention**\n\n- first item\n- second item\n\nInline math $x^2$ here."}
      />,
    );
    expect(screen.getByText("Pay attention").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(document.querySelector(".katex")).not.toBeNull();
  });

  it("renders \\(…\\) and \\[…\\] LaTeX delimiters", () => {
    render(
      <MarkdownContent content={"Value \\(3.38\\) and \\(E=5\\to8\\)."} />,
    );
    expect(document.querySelectorAll(".katex")).toHaveLength(2);
  });

  it("recovers a mixed-up delimiter pair", () => {
    render(<MarkdownContent content={"from \\(E=5$ to $E=8$"} />);
    expect(document.querySelectorAll(".katex")).toHaveLength(2);
  });

  it("renders fenced code as a code block", () => {
    render(<MarkdownContent content={"```tex\n\\usepackage{amsmath}\n```"} />);
    expect(document.querySelector("pre code")).not.toBeNull();
    expect(screen.getByText(/usepackage/)).toBeTruthy();
  });
});
