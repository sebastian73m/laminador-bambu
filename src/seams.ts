import type { Seam, Segment, Vec3 } from "./types.js";

// Bambu GCodeProcessor detects seams at outer loops whose ends are <0.25 mm
// apart. G-code has no universal SEAM comment. Never mark open/spiral paths.
export function detectSeams(
  segments: Segment[],
  warnings?: Set<string>,
): Seam[] {
  const seams: Seam[] = [];
  let run:
    | {
        first: Segment;
        last: Segment;
        index: number;
        length: number;
        exterior: boolean;
      }
    | undefined;
  const distance = (a: Vec3, b: Vec3) =>
    Math.hypot(...a.map((v, i) => v - b[i]));
  const flush = () => {
    if (run && run.length > 0.5 && distance(run.first.a, run.last.b) < 0.25) {
      if (!run.exterior) {
        warnings?.add(
          "No se infieren costuras de contornos clasificados solo como voladizo: el G-code no distingue pared exterior de interior.",
        );
        run = undefined;
        return;
      }
      seams.push({
        position: run.first.a.map((v, i) => (v + run!.last.b[i]) / 2) as Vec3,
        layer: run.first.layer,
        role: run.first.role,
        tool: run.first.tool,
        segmentIndex: run.index,
      });
    }
    run = undefined;
  };
  segments.forEach((s, index) => {
    const outer = /^(?:outer wall|external perimeter)$/i.test(s.role);
    const overhang = /^(?:overhang wall|overhang perimeter)$/i.test(s.role);
    const planar = Math.abs(s.a[2] - s.b[2]) < 1e-5;
    if (!s.extruding || s.layer < 1 || !planar || (!outer && !overhang)) {
      flush();
      return;
    }
    if (
      run &&
      (run.first.layer !== s.layer ||
        run.first.tool !== s.tool ||
        distance(run.last.b, s.a) > 1e-5 ||
        Math.abs(run.first.a[2] - s.a[2]) > 1e-5)
    )
      flush();
    if (!run) run = { first: s, last: s, index, length: 0, exterior: outer };
    if (run) {
      run.exterior ||= outer;
      run.last = s;
      run.index = index;
      run.length += distance(s.a, s.b);
    }
  });
  flush();
  return seams;
}
