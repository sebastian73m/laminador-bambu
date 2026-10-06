import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createService, type Service } from "../src/service.js";
import { zipFixture } from "./zip-fixture.js";
let dir: string, service: Service;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "upload-"));
  await mkdir(join(dir, "projects"));
  service = createService({
    engine: "",
    projects: join(dir, "projects"),
    jobs: join(dir, "jobs"),
    timeoutMs: 1000,
    maxConcurrent: 1,
    maxSegments: 1000,
    maxFileBytes: 100000,
    maxExpandedBytes: 100000,
    maxJobs: 10,
  });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
it("imports chunked 3MF and exposes a relative local project", async () => {
  const buffer = zipFixture({ "Metadata/plate_1.gcode": "G1 X1 E1" });
  const started = await service.beginImport(buffer.length);
  const split = 20;
  const first = await service.appendImport({
    uploadId: started.uploadId,
    offset: 0,
    base64: buffer.subarray(0, split).toString("base64"),
  });
  expect(first.nextOffset).toBe(split);
  const last = await service.appendImport({
    uploadId: started.uploadId,
    offset: split,
    base64: buffer.subarray(split).toString("base64"),
  });
  expect(last.project).toMatch(/\.3mf$/);
  expect(await readFile(join(service.config.projects, last.project!))).toEqual(
    buffer,
  );
  expect(
    (await service.openPreview({ project: last.project })).plates,
  ).toHaveLength(1);
});
it("rejects out of order or oversized imports", async () => {
  await expect(service.beginImport(100001)).rejects.toThrow(/límite/);
  const started = await service.beginImport(10);
  await expect(
    service.appendImport({
      uploadId: started.uploadId,
      offset: 1,
      base64: "eA==",
    }),
  ).rejects.toThrow(/offset/i);
  await expect(
    service.appendImport({
      uploadId: started.uploadId,
      offset: 0,
      base64: Buffer.alloc(11).toString("base64"),
    }),
  ).rejects.toThrow(/tamaño/);
});
it("does not publish invalid 3MF files", async () => {
  const started = await service.beginImport(3);
  await expect(
    service.appendImport({
      uploadId: started.uploadId,
      offset: 0,
      base64: Buffer.from("bad").toString("base64"),
    }),
  ).rejects.toThrow();
  expect((await service.listProjects()).projects).toEqual([]);
});
