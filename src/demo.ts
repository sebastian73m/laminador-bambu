import { parseGcode } from "./gcode.js";
import type { SliceResult } from "./types.js";
// Synthetic toolpaths for testing navigation only; never presented as a real slice.
export function makeDemo(): SliceResult {
  const lines = ["; DEMOSTRACIÓN: trayectorias sintéticas", "G90", "M83"];
  for (let layer = 1; layer <= 90; layer++) {
    const z = layer * 0.24,
      r = 18 + 5 * Math.sin((layer / 90) * Math.PI),
      cx = 45,
      cy = 45;
    lines.push(
      "; CHANGE_LAYER",
      `; Z_HEIGHT: ${z}`,
      "; LAYER_HEIGHT: 0.24",
      `G1 Z${z.toFixed(3)} F3000`,
    );
    for (let wall = 0; wall < 3; wall++) {
      const radius = r - wall * 0.45;
      lines.push(
        `; FEATURE: ${wall === 0 ? "Outer wall" : "Inner wall"}`,
        `; LINE_WIDTH: 0.45`,
        `G1 X${(cx + radius).toFixed(4)} Y${cy} F9000`,
      );
      for (let i = 1; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        lines.push(
          `G1 X${(cx + radius * Math.cos(a)).toFixed(4)} Y${(cy + radius * Math.sin(a)).toFixed(4)} E0.03 F2400`,
        );
      }
    }
    if (layer < 5 || layer > 86) {
      lines.push("; FEATURE: Top surface");
      for (let i = -14; i <= 14; i += 2) {
        const dx = Math.sqrt(Math.max(0, (r - 1.5) ** 2 - i * i));
        lines.push(
          `G1 X${cx - dx} Y${cy + i} F9000`,
          `G1 X${cx + dx} E0.8 F1800`,
        );
      }
    }
  }
  const p = parseGcode(lines.join("\n"));
  p.name = "Jarrón · demostración";
  p.statistics.source = "demostración";
  p.warnings.unshift(
    "Demostración sintética: no es un laminado real. Tiempo y consumo no disponibles.",
  );
  return { plates: [p], warnings: [] };
}
