import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "@spektrum/db";
import { pdfRenders, projects } from "@spektrum/db/schema";
import {
  currentRevisionKey,
  type CompileJob,
  type Diagnostic,
  type ProjectStats,
  type SyncTexMap,
} from "@spektrum/shared/compile";
import { revisionHash } from "@spektrum/shared/revision";
import { normalizeDocumentPath } from "@spektrum/shared/paths";
import { parseLog, parseSyncTex, parseTexcount } from "@spektrum/latex";
import { putObject } from "@spektrum/storage";
import { snapshotAfterCompile } from "@spektrum/db/snapshots";
import { connectRedis, supersededBy } from "./queue";
import { materialise } from "./materialise";
import { runContainer } from "./container";
import { publish } from "./publish";

const ZERO_STATS: ProjectStats = {
  words: 0,
  wordsInText: 0,
  wordsInHeaders: 0,
  wordsOutsideText: 0,
  headers: 0,
  figures: 0,
  mathInline: 0,
  mathDisplay: 0,
};

function detectProgram(source: string): string {
  const m = /%\s*!TEX program\s*=\s*(xelatex|lualatex|pdflatex)/i.exec(source);
  return m ? m[1]!.toLowerCase() : "pdflatex";
}

/** Page boxes from the PDF (pdfjs reads compressed object streams). */
async function mediaBoxes(pdf: Buffer): Promise<Array<{ width: number; height: number }>> {
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
    const boxes: Array<{ width: number; height: number }> = [];
    for (let page = 1; page <= doc.numPages; page += 1) {
      const viewport = (await doc.getPage(page)).getViewport({ scale: 1 });
      boxes.push({ width: viewport.width, height: viewport.height });
    }
    await doc.cleanup();
    if (boxes.length > 0) return boxes;
  } catch {
    /* fall through to the letter default */
  }
  return [{ width: 612, height: 792 }];
}


function tail(text: string, lines: number): string {
  const all = text.split("\n");
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}

async function upsert(
  job: CompileJob,
  values: Partial<typeof pdfRenders.$inferInsert>,
): Promise<void> {
  await db
    .insert(pdfRenders)
    .values({
      projectId: job.projectId,
      revisionHash: job.revisionHash,
      mainFile: job.mainFile,
      ...values,
    })
    .onConflictDoUpdate({
      target: [pdfRenders.projectId, pdfRenders.revisionHash],
      set: values,
    });
}

export async function runCompile(
  job: CompileJob,
): Promise<{ status: "ok" | "error"; durationMs: number }> {
  const started = Date.now();
  const redis = connectRedis();

  try {
    const cached = await db
      .select({ id: pdfRenders.id })
      .from(pdfRenders)
      .where(
        and(
          eq(pdfRenders.projectId, job.projectId),
          eq(pdfRenders.revisionHash, job.revisionHash),
          eq(pdfRenders.status, "ok"),
        ),
      );
    if (cached.length > 0) return { status: "ok", durationMs: 0 };

    await upsert(job, { status: "running" });
    await publish(redis, job.projectId, {
      event: "status",
      state: "running",
      revision: job.revisionHash,
    });

    const { dir, documents } = await materialise(job.projectId);
    try {
      const actual = revisionHash(documents);
      const current = await redis.get(currentRevisionKey(job.projectId));
      if (
        actual !== job.revisionHash ||
        supersededBy(current, job.revisionHash)
      ) {
        await upsert(job, { status: "superseded" });
        return { status: "error", durationMs: Date.now() - started };
      }

      const mainPath = normalizeDocumentPath(job.mainFile);
      const main = documents.find(
        (d) => normalizeDocumentPath(d.path) === mainPath,
      );
      if (!main) throw new Error(`main file not found: ${job.mainFile}`);

      const program = detectProgram(main.content ?? "");
      const result = await runContainer(dir, main.path, program);
      if (result.timedOut) {
        throw new Error("Compilation timed out after 30s");
      }

      const jobName = basename(main.path).replace(/\.[^.]+$/, "");
      const logPath = join(result.outDir, `${jobName}.log`);
      const pdfPath = join(result.outDir, `${jobName}.pdf`);
      const synctexPath = join(result.outDir, `${jobName}.synctex.gz`);
      const texcountPath = join(dir, "texcount.txt");

      if (!existsSync(logPath)) {
        throw new Error(
          `latexmk failed (exit ${result.exitCode}): ${tail(result.stdout, 20)}`,
        );
      }
      if (result.exitCode !== 0) {
        const log = existsSync(logPath)
          ? readFileSync(logPath, "utf8")
          : result.stdout;
        const diagnostics = parseLog(log);
        await upsert(job, {
          status: "error",
          log: tail(log, 2000),
          diagnostics,
        });
        await publish(redis, job.projectId, {
          event: "status",
          state: "error",
          revision: job.revisionHash,
        });
        return { status: "error", durationMs: Date.now() - started };
      }

      if (!existsSync(pdfPath)) {
        const log = readFileSync(logPath, "utf8");
        const diagnostics = parseLog(log);
        await upsert(job, {
          status: "error",
          log: tail(log, 2000),
          diagnostics,
        });
        await publish(redis, job.projectId, {
          event: "status",
          state: "error",
          revision: job.revisionHash,
        });
        return { status: "error", durationMs: Date.now() - started };
      }

      const pdf = readFileSync(pdfPath);
      if (pdf.byteLength > 20 * 1024 * 1024) {
        throw new Error("PDF exceeds 20 MB");
      }

      const log = readFileSync(logPath, "utf8");
      const diagnostics = parseLog(log);
      const pages = await mediaBoxes(pdf);
      const map: SyncTexMap = existsSync(synctexPath)
        ? parseSyncTex(readFileSync(synctexPath), pages)
        : { forward: {}, backward: [] };
      const stats: ProjectStats = existsSync(texcountPath)
        ? parseTexcount(
            readFileSync(texcountPath, "utf8"),
            documents.map((d) => d.content ?? ""),
          )
        : ZERO_STATS;

      const currentAtEnd = await redis.get(currentRevisionKey(job.projectId));
      if (supersededBy(currentAtEnd, job.revisionHash)) {
        await upsert(job, { status: "superseded" });
        return { status: "error", durationMs: Date.now() - started };
      }

      const pdfKey = `pdf/${job.projectId}/${job.revisionHash}.pdf`;
      const synctexKey = `synctex/${job.projectId}/${job.revisionHash}.json`;
      await putObject("pdf", pdfKey, pdf, "application/pdf");
      await putObject("pdf", synctexKey, JSON.stringify(map), "application/json");

      const durationMs = Date.now() - started;
      await upsert(job, {
        status: "ok",
        log: tail(log, 2000),
        diagnostics,
        stats,
        durationMs,
        pdfKey,
        synctexKey,
      });
      const [project] = await db
        .select({ ownerId: projects.ownerId })
        .from(projects)
        .where(eq(projects.id, job.projectId));
      if (project) {
        try {
          await snapshotAfterCompile(job.projectId, project.ownerId);
        } catch {
          // A snapshot failure must not fail an otherwise good compile.
        }
      }
      await publish(redis, job.projectId, {
        event: "result",
        revision: job.revisionHash,
        pdfUrl: `/api/projects/${job.projectId}/render/${job.revisionHash}/pdf`,
        diagnostics,
        stats,
        durationMs,
      });
      return { status: "ok", durationMs };
    } finally {
      // materialise's temp dir is removed by the caller of runContainer? No:
      // remove it here so every path cleans up.
      try {
        const { rm } = await import("node:fs/promises");
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await upsert(job, {
      status: "error",
      log: tail(message, 2000),
      diagnostics: [{ severity: "error", message, raw: message }],
    }).catch(() => undefined);
    await publish(redis, job.projectId, {
      event: "status",
      state: "error",
      revision: job.revisionHash,
    }).catch(() => undefined);
    return { status: "error", durationMs: Date.now() - started };
  } finally {
    redis.disconnect();
  }
}

export type { Diagnostic };