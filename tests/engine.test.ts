import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProject, makeSliceArgs, probeEngine } from "../src/engine.js";
import { JobManager } from "../src/jobs.js";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "laminador-"));
  await mkdir(join(dir, "projects"));
  await writeFile(join(dir, "projects", "pieza con espacios.3mf"), "test");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
describe("engine", () => {
  it("preserves spaces as one CLI argument", () => {
    const args = makeSliceArgs("/input/a b.3mf", "/output/result.3mf", 2);
    expect(args).toEqual([
      "--slice",
      "2",
      "--debug",
      "2",
      "--outputdir",
      "/output",
      "--export-3mf",
      "result.3mf",
      "/input/a b.3mf",
    ]);
  });
  it("resolves project inside root", async () => {
    expect(
      await resolveProject(join(dir, "projects"), "pieza con espacios.3mf"),
    ).toBe(await realpath(join(dir, "projects", "pieza con espacios.3mf")));
  });
  it("rejects traversal and non 3mf", async () => {
    await expect(
      resolveProject(join(dir, "projects"), "../outside.3mf"),
    ).rejects.toThrow();
    await expect(
      resolveProject(join(dir, "projects"), "x.stl"),
    ).rejects.toThrow(/3MF/i);
  });
  it("rejects a symlink outside root", async () => {
    await writeFile(join(dir, "outside.3mf"), "x");
    try {
      await symlink(
        join(dir, "outside.3mf"),
        join(dir, "projects", "link.3mf"),
      );
    } catch {
      return;
    }
    await expect(
      resolveProject(join(dir, "projects"), "link.3mf"),
    ).rejects.toThrow(/carpeta/);
  });
  it("reports missing engine", async () => {
    expect((await probeEngine(join(dir, "missing"))).available).toBe(false);
  });
});
describe("jobs with actual test child processes, not slicer validation", () => {
  async function fixture(body: string) {
    const script = join(dir, "worker.mjs");
    await writeFile(script, body);
    return new JobManager(
      {
        engine: process.execPath,
        projects: join(dir, "projects"),
        jobs: join(dir, "jobs"),
        timeoutMs: 200,
        maxConcurrent: 1,
        maxSegments: 1000,
        maxFileBytes: 1000000,
        maxExpandedBytes: 2000000,
        maxJobs: 10,
      },
      () => [script],
    );
  }
  async function settled(manager: JobManager, id: string) {
    for (let i = 0; i < 100; i++) {
      const j = manager.get(id);
      if (j.state !== "running" && j.state !== "queued") return j;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("not settled");
  }
  it("captures failure and keeps original intact", async () => {
    const m = await fixture(
      "process.stderr.write('perfil inválido');process.exit(3)",
    );
    const j = await m.start({ project: "pieza con espacios.3mf", plate: 0 });
    const final = await settled(m, j.id);
    expect(final.state).toBe("failed");
    expect(final.message).toContain("perfil inválido");
  });
  it("times out and terminates a child", async () => {
    const m = await fixture("setInterval(()=>{},1000)");
    const j = await m.start({ project: "pieza con espacios.3mf", plate: 0 });
    expect((await settled(m, j.id)).state).toBe("failed");
    expect(m.get(j.id).message).toMatch(/tiempo/i);
  });
  it("cancels a running child", async () => {
    const m = await fixture("setInterval(()=>{},1000)");
    const j = await m.start({ project: "pieza con espacios.3mf", plate: 0 });
    await m.cancel(j.id);
    expect((await settled(m, j.id)).state).toBe("cancelled");
  });
  it("rejects more than configured concurrency", async () => {
    const m = await fixture("setInterval(()=>{},1000)");
    const j = await m.start({ project: "pieza con espacios.3mf", plate: 0 });
    await expect(
      m.start({ project: "pieza con espacios.3mf", plate: 0 }),
    ).rejects.toThrow(/curso/);
    await m.cancel(j.id);
  });
});

it.skipIf(process.platform === "win32")(
  "isolates native --help side effects from the workspace",
  async () => {
    const { chmod } = await import("node:fs/promises");
    const script = join(dir, "probe-engine");
    await writeFile(
      script,
      "#!/usr/bin/env node\n" +
        `if(process.cwd()===${JSON.stringify(process.cwd())}) { process.stderr.write('probe not isolated'); process.exit(1); } console.log('--slice --export-3mf');`,
    );
    await chmod(script, 0o700);
    expect((await probeEngine(script)).available).toBe(true);
  },
);
