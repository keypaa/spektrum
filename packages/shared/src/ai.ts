import { z } from "zod";
import { diffProposalSchema } from "./ai/diff";

export * from "./ai/images";
export * from "./ai/prompts";
export * from "./ai/providers";
export * from "./ai/tools";

export type {
  DiffHunk,
  DiffProposal,
} from "./ai/diff";

export type ThinkingLevel =
  | "Minimal"
  | "Low"
  | "Medium"
  | "High"
  | "Extra high";

export const THINKING: Record<
  ThinkingLevel,
  { effort: "minimal" | "low" | "medium" | "high"; maxOutput: number }
> = {
  Minimal: { effort: "minimal", maxOutput: 4000 },
  Low: { effort: "low", maxOutput: 8000 },
  Medium: { effort: "medium", maxOutput: 16000 },
  High: { effort: "high", maxOutput: 32000 },
  "Extra high": { effort: "high", maxOutput: 64000 },
};

export type ToolName =
  | "list_files"
  | "read_pdf"
  | "read_file"
  | "write_file"
  | "edit_file"
  | "create_file"
  | "delete_file"
  | "compile"
  | "get_logs"
  | "search_project";

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: ToolName; args: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "image"; id: string; blobKey: string; name: string; mimeType: string }
  | {
      type: "diff";
      id: string;
      messageId: string;
      proposal: import("./ai/diff").DiffProposal;
      status: "pending" | "accepted" | "rejected";
    };

const toolCall = z.object({
  id: z.string(),
  name: z.string(),
  args: z.unknown(),
});

export const chatEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("meta"),
    data: z.object({
      threadId: z.string(),
      userMessageId: z.string(),
      model: z.string(),
    }),
  }),
  z.object({
    event: z.literal("thinking"),
    data: z.object({ delta: z.string() }),
  }),
  z.object({
    event: z.literal("text"),
    data: z.object({ delta: z.string() }),
  }),
  z.object({ event: z.literal("tool_call"), data: toolCall }),
  z.object({
    event: z.literal("tool_result"),
    data: z.object({
      id: z.string(),
      ok: z.boolean(),
      summary: z.string(),
    }),
  }),
  z.object({
    event: z.literal("diff"),
    data: diffProposalSchema.extend({
      id: z.string(),
      messageId: z.string(),
    }),
  }),
  z.object({
    event: z.literal("title"),
    data: z.object({
      threadId: z.string(),
      title: z.string(),
      titleSource: z.literal("llm"),
    }),
  }),
  z.object({
    event: z.literal("done"),
    data: z.object({ usage: z.object({ in: z.number(), out: z.number() }) }),
  }),
  z.object({
    event: z.literal("error"),
    data: z.object({ message: z.string(), retryable: z.boolean() }),
  }),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;