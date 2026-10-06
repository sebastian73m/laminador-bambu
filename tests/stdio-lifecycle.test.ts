import { it, expect } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipFixture } from "./zip-fixture.js";

it.each(["stdin EOF", "broken stdout"])(
  "cancels the active engine and exits on %s",
  async (disconnect) => {
    const dir = await mkdtemp(join(tmpdir(), "laminador-stdio-"));
    const projects = join(dir, "projects");
    await mkdir(projects);
    await writeFile(
      join(projects, "test.3mf"),
      zipFixture({ "3D/3dmodel.model": "<model/>" }),
    );
    const pidFile = join(dir, "engine.pid");
    const worker = join(dir, "worker.mjs");
    await writeFile(
      worker,
      `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(()=>{},1000);`,
    );
    // Use a preload to replace spawn arguments for the test engine only. The
    // actual server, EOF events, JobManager and process cleanup run unmodified.
    const preload = join(dir, "engine-preload.mjs");
    await writeFile(
      preload,
      `import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module'; const original=cp.spawn; cp.spawn=(command,args,options)=>original(command, command===process.execPath && args[0]==='--slice' ? [${JSON.stringify(worker)}] : args, options); syncBuiltinESMExports();`,
    );
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--import", preload, "src/server.ts", "--stdio"],
      {
        env: {
          ...process.env,
          PROJECTS_DIR: projects,
          JOBS_DIR: join(dir, "jobs"),
          BAMBU_STUDIO_PATH: process.execPath,
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let enginePid: number | undefined;
    const exited = new Promise<number | null>((r) => child.once("exit", r));
    try {
      const send = (message: object) =>
        child.stdin.write(
          JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n",
        );
      send({
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "eof-regression", version: "1" },
        },
      });
      send({ method: "notifications/initialized" });
      send({
        id: 2,
        method: "tools/call",
        params: {
          name: "slice_project",
          arguments: { project: "test.3mf", plate: 0 },
        },
      });
      await expect
        .poll(
          async () => {
            try {
              enginePid = Number(await readFile(pidFile, "utf8"));
              return enginePid > 0;
            } catch {
              return false;
            }
          },
          { timeout: 8000 },
        )
        .toBe(true);
      if (disconnect === "stdin EOF") child.stdin.end();
      else {
        child.stdout.destroy();
        send({ id: 3, method: "tools/list", params: {} });
      }
      const result = await Promise.race([
        exited,
        new Promise((r) => setTimeout(() => r("still-running"), 2000)),
      ]);
      expect(result).toBe(0);
      expect(() => process.kill(enginePid!, 0)).toThrow();
    } finally {
      if (child.exitCode === null) child.kill("SIGTERM");
      await exited;
      if (enginePid) {
        try {
          process.kill(enginePid, "SIGKILL");
        } catch {}
      }
      await rm(dir, { recursive: true, force: true });
    }
  },
);
