import { it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSlice, inspectArchive } from "../src/artifacts.js";
import { zipFixture } from "./zip-fixture.js";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "artifacts-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
it("loads multiple plates and official slice_info metadata", async () => {
  const path = join(dir, "test.3mf");
  await writeFile(
    path,
    zipFixture({
      "Metadata/plate_1.gcode": "G1 X1 E1",
      "Metadata/plate_2.gcode": "G1 Y2 E1",
      "Metadata/slice_info.config":
        '<config><plate><metadata key="index" value="1"/><metadata key="prediction" value="120"/><metadata key="weight" value="4.2"/><filament id="1" type="PLA" color="#ff0000" used_m="1.2" used_g="4.2"/></plate><plate><metadata key="index" value="2"/><metadata key="prediction" value="240"/></plate></config>',
    }),
  );
  const result = await loadSlice(path);
  expect(result.plates.map((p) => p.id)).toEqual([1, 2]);
  expect(result.plates[0].statistics.totalSeconds).toBe(120);
  expect(result.plates[1].statistics.totalSeconds).toBe(240);
  expect(result.plates[0].statistics.filaments[0].lengthMm).toBe(1200);
  expect(result.plates[0].statistics.weightG).toBe(4.2);
});
it("rejects invalid zip", async () => {
  const path = join(dir, "bad.3mf");
  await writeFile(path, "bad");
  await expect(loadSlice(path)).rejects.toThrow();
});
it("enforces expanded byte limit", async () => {
  const path = join(dir, "big.3mf");
  await writeFile(
    path,
    zipFixture({ "Metadata/plate_1.gcode": "a".repeat(200) }),
  );
  await expect(loadSlice(path, { maxExpandedBytes: 100 })).rejects.toThrow(
    /límite/i,
  );
});
it("inspects unsliced project without manufacturing paths", async () => {
  const path = join(dir, "input.3mf");
  await writeFile(
    path,
    zipFixture({
      "3D/3dmodel.model": "<model/>",
      "Metadata/project_settings.config": '{"printer_model":"Bambu Lab A1"}',
    }),
  );
  expect((await inspectArchive(path)).slicedPlates).toEqual([]);
  await expect(loadSlice(path)).rejects.toThrow(/G-code/);
});
