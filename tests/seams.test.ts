import { expect, it } from "vitest";
import { parseGcode } from "../src/gcode.js";
const loop = `M83
; CHANGE_LAYER
; Z_HEIGHT: 0.2
G1 X10 Y10 Z0.2
; FEATURE: Outer wall
G1 X20 Y10 E1
G1 X20 Y20 E1
G1 X10 Y20 E1
G1 X10 Y10.06 E1
G1 X8 Y8
`;
it("marks the near-closed outer loop at its real endpoint midpoint", () => {
  const plate = parseGcode(loop);
  expect(plate.seams).toHaveLength(1);
  expect(plate.seams![0].position).toEqual([10, 10.030000000000001, 0.2]);
  expect(plate.seams![0].layer).toBe(1);
  expect(plate.segments[plate.seams![0].segmentIndex].b).toEqual([
    10, 10.06, 0.2,
  ]);
});
it("does not invent seams on open walls, infill, inner walls or spiral paths", () => {
  expect(parseGcode(loop.replace("Y10.06", "Y12")).seams).toEqual([]);
  expect(parseGcode(loop.replace("Outer wall", "Inner wall")).seams).toEqual(
    [],
  );
  expect(parseGcode(loop.replace("Outer wall", "Sparse infill")).seams).toEqual(
    [],
  );
  expect(
    parseGcode(loop.replace("X10 Y10.06 E1", "X10 Y10.06 Z0.4 E1")).seams,
  ).toEqual([]);
});
it("keeps the real contour start when overhang precedes outer wall", () => {
  const mixed = loop
    .replace("; FEATURE: Outer wall", "; FEATURE: Overhang wall")
    .replace("G1 X20 Y20 E1", "; FEATURE: Outer wall\nG1 X20 Y20 E1");
  expect(parseGcode(mixed).seams).toHaveLength(1);
  expect(parseGcode(mixed).seams![0].position[0]).toBe(10);
  expect(parseGcode(mixed).seams![0].position[1]).toBeCloseTo(10.03);
});
it("warns instead of classifying an unidentified all-overhang loop as outer", () => {
  const p = parseGcode(loop.replace("Outer wall", "Overhang wall"));
  expect(p.seams).toEqual([]);
  expect(p.warnings.join(" ")).toMatch(/voladizo/i);
});
