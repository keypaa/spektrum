// Compile contracts shared by the web app and the worker (spec §11, §19.3).
// This module is imported by client code (the viewer's event parser), so it
// must stay free of Node-only imports; the revision hash lives in
// `@spektrum/shared/revision` for that reason.

import { z } from "zod";

/** The job the web route enqueues and the worker consumes. */
export const compileJobSchema = z.object({
  projectId: z.string().uuid(),
  /** 64 lowercase hex chars — the revision hash computed server-side. */
  revisionHash: z.string().regex(/^[0-9a-f]{64}$/),
  mainFile: z.string().min(1).max(200),
});
export type CompileJob = z.infer<typeof compileJobSchema>;

/** One parsed TeX diagnostic (spec §11.3). `line` is 0-based here. */
export const diagnosticSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().int().min(0).optional(),
  raw: z.string(),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;

/** The compact SyncTeX map the worker stores next to the PDF (spec §11.6). */
export const syncTexMapSchema = z.object({
  forward: z.record(
    z.string(),
    z.array(
      z.object({
        line: z.number(),
        page: z.number(),
        x: z.number(),
        y: z.number(),
      }),
    ),
  ),
  backward: z.array(
    z.object({
      page: z.number(),
      anchors: z.array(
        z.object({
          y: z.number(),
          path: z.string(),
          line: z.number(),
        }),
      ),
    }),
  ),
});
export type SyncTexMap = z.infer<typeof syncTexMapSchema>;

/** The Project Info card values (spec §9.1). */
export const projectStatsSchema = z.object({
  words: z.number(),
  wordsInText: z.number(),
  wordsInHeaders: z.number(),
  wordsOutsideText: z.number(),
  headers: z.number(),
  figures: z.number(),
  mathInline: z.number(),
  mathDisplay: z.number(),
});
export type ProjectStats = z.infer<typeof projectStatsSchema>;

/** `pdf_renders.status`. */
export const renderStatusSchema = z.enum([
  "queued",
  "running",
  "ok",
  "error",
  "superseded",
]);
export type RenderStatus = z.infer<typeof renderStatusSchema>;

/** The SSE events the render stream publishes (spec §11.4). */
export const renderEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("status"),
    state: renderStatusSchema,
    revision: z.string(),
  }),
  z.object({ event: z.literal("log"), line: z.string() }),
  z.object({
    event: z.literal("result"),
    revision: z.string(),
    pdfUrl: z.string(),
    diagnostics: z.array(diagnosticSchema),
    stats: projectStatsSchema,
    durationMs: z.number(),
  }),
  z.object({
    event: z.literal("conflict"),
    revision: z.string(),
    documentId: z.string().uuid(),
  }),
]);
export type RenderEvent = z.infer<typeof renderEventSchema>;

/** One queue name and two key builders, shared by web and worker. */
export const QUEUE_NAME = "compile";
export const renderChannel = (projectId: string): string =>
  `render:${projectId}`;
export const currentRevisionKey = (projectId: string): string =>
  `compile:current:${projectId}`;