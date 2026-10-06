import { it, expect } from "vitest";
import { mkdtemp, mkdir, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JobManager } from "../src/jobs.js";
import { loadSlice } from "../src/artifacts.js";
import { probeEngine } from "../src/engine.js";
it.skipIf(!process.env.BAMBU_STUDIO_PATH)(
  "slices the supplied 3MF with real Bambu Studio and reads its statistics",
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "real-slice-"));
    const manager = new JobManager({
      engine: process.env.BAMBU_STUDIO_PATH!,
      projects: join(dir, "projects"),
      jobs: join(dir, "jobs"),
      timeoutMs: 90000,
      maxConcurrent: 1,
      maxSegments: 200000,
      maxFileBytes: 20000000,
      maxExpandedBytes: 100000000,
      maxJobs: 10,
    });
    try {
      await mkdir(manager.config.projects);
      await cp(
        resolve("examples/cubo-p2s-laminado.3mf"),
        join(manager.config.projects, "cubo.3mf"),
      );
      expect((await probeEngine(manager.config.engine)).available).toBe(true);
      const job = await manager.start({ project: "cubo.3mf", plate: 0 });
      let result = manager.get(job.id);
      for (let i = 0; i < 300 && result.state === "running"; i++) {
        await new Promise((r) => setTimeout(r, 300));
        result = manager.get(job.id);
      }
      expect(result.state, result.message + "\n" + result.log).toBe(
        "completed",
      );
      const plate = (await loadSlice(result.output!)).plates[0];
      expect(plate.layers.filter((l) => l.index > 0)).toHaveLength(50);
      expect(plate.segments.length).toBeGreaterThan(2000);
      expect(plate.statistics.totalSeconds).toBeGreaterThan(300);
      expect(plate.statistics.weightG).toBeCloseTo(2.11, 1);
      expect(plate.statistics.filaments[0].lengthMm).toBeGreaterThan(600);
    } finally {
      await manager.shutdown();
      await rm(dir, { recursive: true, force: true });
    }
  },
  120000,
);
it("reads the real checked-in Bambu artifact with exact source statistics", async () => {
  const p = (await loadSlice(resolve("examples/cubo-p2s-laminado.3mf")))
    .plates[0];
  expect(p.statistics.totalSeconds).toBe(710);
  expect(p.statistics.printSeconds).toBe(291);
  expect(p.statistics.weightG).toBe(2.11);
  expect(p.statistics.filaments[0].lengthMm).toBe(694.76);
  expect(p.statistics.filaments[0].volumeCm3).toBeCloseTo(1.67109);
  expect(p.layers.filter((l) => l.index > 0)).toHaveLength(50);
});
