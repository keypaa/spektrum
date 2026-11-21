import { describe, expect, it } from "vitest";
import { toolSchemas } from "./tools";

const NAMES = [
  "list_files",
  "read_file",
  "write_file",
  "edit_file",
  "create_file",
  "delete_file",
  "compile",
  "get_logs",
  "search_project",
  "read_pdf",
];

describe("toolSchemas", () => {
  it("exposes ten tools", () => {
    expect(toolSchemas().map((t) => t.function.name).sort()).toEqual(
      [...NAMES].sort(),
    );
  });

  it("describes read_pdf with an optional page range", () => {
    const pdf = toolSchemas().find((t) => t.function.name === "read_pdf");
    expect(pdf?.function.description).toContain("PDF");
    const params = pdf?.function.parameters as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(params.properties ?? {})).toEqual(
      expect.arrayContaining(["path", "pages"]),
    );
  });

  it("requires path, oldText, newText and reason for edit_file", () => {
    const edit = toolSchemas().find((t) => t.function.name === "edit_file");
    const params = edit?.function.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(params.required).toEqual(
      expect.arrayContaining(["path", "oldText", "newText", "reason"]),
    );
    expect(Object.keys(params.properties ?? {})).toEqual(
      expect.arrayContaining(["path", "oldText", "newText", "reason"]),
    );
  });
});