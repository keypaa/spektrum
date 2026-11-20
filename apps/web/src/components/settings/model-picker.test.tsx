// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelPicker } from "./model-picker";

afterEach(cleanup);

const MODELS = [
  { id: "baidu/ernie-5.5-flash-preview:free", label: "ERNIE 5.5 Flash (free)" },
  { id: "openai/gpt-4.1", label: "GPT-4.1" },
  { id: "kilo-auto/free", label: "Auto Free" },
];

describe("ModelPicker", () => {
  it("shows the current model and lets you pick from the full list", async () => {
    const onChange = vi.fn();
    render(
      <ModelPicker label="Chat model" value="openai/gpt-4.1" options={MODELS} onChange={onChange} />,
    );
    expect(screen.getByRole("button", { name: "Chat model" }).textContent).toContain(
      "openai/gpt-4.1",
    );
    await userEvent.click(screen.getByRole("button", { name: "Chat model" }));
    expect(screen.getAllByRole("option")).toHaveLength(3);
    await userEvent.click(screen.getByRole("option", { name: /Auto Free/ }));
    expect(onChange).toHaveBeenCalledWith("kilo-auto/free");
  });

  it("filters the list and allows a custom model id", async () => {
    const onChange = vi.fn();
    render(<ModelPicker label="Fast model" value="" options={MODELS} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Fast model" }));
    await userEvent.type(screen.getByLabelText("Search Fast model"), "my-local-model");
    await userEvent.click(screen.getByRole("option", { name: /Use "my-local-model"/ }));
    expect(onChange).toHaveBeenCalledWith("my-local-model");
  });

  it("closes on Escape", async () => {
    render(<ModelPicker label="Chat model" value="" options={MODELS} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Chat model" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
