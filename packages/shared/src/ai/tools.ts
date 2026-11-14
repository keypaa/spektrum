import { z } from "zod";

const listFiles = z.object({});
const readFile = z.object({
  path: z.string(),
  startLine: z.number().int().optional(),
  endLine: z.number().int().optional(),
});
const writeFile = z.object({
  path: z.string(),
  content: z.string(),
  reason: z.string(),
});
const editFile = z.object({
  path: z.string(),
  oldText: z.string(),
  newText: z.string(),
  reason: z.string(),
});
const createFile = z.object({ path: z.string(), content: z.string() });
const deleteFile = z.object({ path: z.string() });
const compile = z.object({});
const getLogs = z.object({});
const searchProject = z.object({ query: z.string() });

const tool = (name: string, description: string, parameters: z.ZodType) => ({
  type: "function" as const,
  function: {
    name,
    description,
    parameters: z.toJSONSchema(parameters),
  },
});

/** The nine tools exposed to the model (spec §12.4 + §19.4). */
export function toolSchemas() {
  return [
    tool("list_files", "List every file in the project.", listFiles),
    tool(
      "read_file",
      "Read a text file, optionally a line range.",
      readFile,
    ),
    tool(
      "write_file",
      "Propose replacing a whole file (requires user accept).",
      writeFile,
    ),
    tool(
      "edit_file",
      "Propose replacing an exact snippet (requires user accept).",
      editFile,
    ),
    tool(
      "create_file",
      "Propose creating a file (requires user accept).",
      createFile,
    ),
    tool(
      "delete_file",
      "Propose deleting a file (requires user accept).",
      deleteFile,
    ),
    tool("compile", "Compile the project and return diagnostics.", compile),
    tool("get_logs", "Return the last compile diagnostics.", getLogs),
    tool(
      "search_project",
      "Search the project's text documents.",
      searchProject,
    ),
  ];
}

export type ToolSchema = ReturnType<typeof toolSchemas>[number];