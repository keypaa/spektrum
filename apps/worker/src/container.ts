import { execFile, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const IMAGE = process.env.TEXLIVE_IMAGE ?? "spektrum-texlive:dev";
const TIMEOUT_MS = 30_000;

export interface ContainerResult {
  exitCode: number;
  timedOut: boolean;
  outDir: string;
  stdout: string;
}

const latexmkFlag = (program: string): string =>
  program === "xelatex" ? "-xelatex" : program === "lualatex" ? "-lualatex" : "-pdf";

/**
 * Run one compile in the §10.6 sandbox. `/work` is a per-job volume because
 * `docker cp` cannot write into a read-only rootfs' tmpfs; the volume is
 * `volume-nocopy`, pre-chowned to 10001, and removed in `finally`.
 */
export async function runContainer(
  workDir: string,
  mainFile: string,
  program: string,
): Promise<ContainerResult> {
  const outDir = join(workDir, "out");
  const suffix = `${process.pid}-${Date.now()}`;
  const volume = `spektrum-compile-vol-${suffix}`;
  const name = `spektrum-compile-${suffix}`;
  const dir = mainFile.includes("/") ? mainFile.slice(0, mainFile.lastIndexOf("/")) : "";
  const base = mainFile.slice(mainFile.lastIndexOf("/") + 1);
  const cd = dir ? `cd /work/${dir} && ` : "cd /work && ";
  const command = `${cd}latexmk -interaction=nonstopmode -halt-on-error -file-line-error -synctex=1 \
-no-shell-escape ${latexmkFlag(program)} -outdir=/work/out ${base}; rc=$?; \
texcount -total -merge -q ${base} > /work/texcount.txt; echo "$rc" > /work/latexmk.exit`;

  await exec("docker", ["volume", "create", volume]);
  try {
    await exec("docker", [
      "run", "--rm", "-v", `${volume}:/work`, IMAGE, "sh", "-c",
      "chown 10001:10001 /work; touch /work/.keep; chown 10001:10001 /work/.keep",
    ]);

    const { stdout: created } = await exec("docker", [
      "create",
      `--name=${name}`,
      "--network", "none",
      "--read-only",
      "--tmpfs", "/tmp:rw,size=256m,mode=1777",
      "--mount", `type=volume,src=${volume},dst=/work,volume-nocopy`,
      "--user", "10001",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--pids-limit", "128",
      "--memory", "1g",
      "--cpus", "1",
      "-e", "TEXMFVAR=/tmp/texmf",
      "-e", "HOME=/tmp",
      "-w", "/work",
      IMAGE, "sh", "-c", command,
    ]);
    const container = created.trim();

    await exec("docker", ["cp", `${workDir}/.`, `${container}:/work/`]);

    let timedOut = false;
    let containerCode = 1;
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn("docker", ["start", "-a", container]);
      let out = "";
      child.stdout.on("data", (chunk) => { out += chunk.toString(); });
      child.stderr.on("data", (chunk) => { out += chunk.toString(); });
      const timer = setTimeout(() => {
        timedOut = true;
        void exec("docker", ["stop", "-t", "5", container]).catch(() => undefined);
      }, TIMEOUT_MS);
      child.on("error", reject);
      child.on("exit", (code) => {
        clearTimeout(timer);
        containerCode = code ?? 1;
        resolve(out);
      });
    });

    await exec("docker", ["cp", `${container}:/work/out`, outDir]).catch(() => undefined);
    await exec("docker", ["cp", `${container}:/work/texcount.txt`, join(workDir, "texcount.txt")]).catch(() => undefined);
    await exec("docker", ["cp", `${container}:/work/latexmk.exit`, join(workDir, "latexmk.exit")]).catch(() => undefined);

    const exitPath = join(workDir, "latexmk.exit");
    const exitCode = existsSync(exitPath)
      ? Number(readFileSync(exitPath, "utf8").trim())
      : containerCode;

    return { exitCode, timedOut, outDir, stdout };
  } finally {
    await exec("docker", ["rm", "-f", name]).catch(() => undefined);
    await exec("docker", ["volume", "rm", volume]).catch(() => undefined);
  }
}