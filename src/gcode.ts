import type { PlatePreview, Segment, Vec3, Statistics } from "./types.js";
import { detectSeams } from "./seams.js";
export function parseDuration(value: string): number | null {
  const s = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  let seconds = 0,
    found = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*([dhms])/gi)) {
    seconds +=
      Number(m[1]) *
      ({ d: 86400, h: 3600, m: 60, s: 1 }[m[2].toLowerCase()] ?? 0);
    found = true;
  }
  return found ? seconds : null;
}
export function parseGcode(text: string, maxSegments = 2000000): PlatePreview {
  const segments: Segment[] = [],
    warnings = new Set<string>();
  const statistics: Statistics = {
    printSeconds: null,
    totalSeconds: null,
    weightG: null,
    filaments: [],
    source: text.includes("BambuStudio") ? "Bambu Studio" : "G-code",
  };
  let pos: Vec3 = [0, 0, 0],
    origin: Vec3 = [0, 0, 0],
    e = 0,
    absolute = true,
    eAbsolute = true,
    scale = 1,
    feed = 0,
    layer = 0,
    z = 0,
    role = "Preparación",
    tool = 0,
    width = 0.42,
    height = 0.2,
    conditional = 0,
    plane = "G17";
  const layerZ = new Map<number, number>([[0, 0]]);
  let layerMarker = false;
  const add = (a: Vec3, b: Vec3, extruding: boolean) => {
    if (a.every((v, i) => Math.abs(v - b[i]) < 1e-8)) return;
    if ([...a, ...b].some((v) => !Number.isFinite(v) || Math.abs(v) > 100000))
      throw Error("Coordenadas G-code inválidas");
    if (segments.length >= maxSegments)
      throw Error("Se excedió el límite de trayectorias; aumenta MAX_SEGMENTS");
    segments.push({
      a: [...a],
      b: [...b],
      layer,
      role,
      tool,
      speed: feed / 60,
      extruding,
      width,
      height,
    });
  };
  for (const raw of text.split(/\r?\n/)) {
    const semicolon = raw.indexOf(";"),
      comment = semicolon >= 0 ? raw.slice(semicolon + 1).trim() : "";
    if (comment) {
      const times = comment.match(
        /model printing time:\s*([^;]+);\s*total estimated time:\s*(.+)/i,
      );
      if (times) {
        statistics.printSeconds = parseDuration(times[1]);
        statistics.totalSeconds = parseDuration(times[2]);
      }
      const time = comment.match(
        /estimated printing time \(normal mode\)\s*=\s*(.+)/i,
      );
      if (time) {
        statistics.printSeconds = parseDuration(time[1]);
        statistics.totalSeconds = statistics.printSeconds;
      }
      const usage = comment.match(
        /(?:filament used|total filament (length|volume|weight))\s*\[(mm|cm\^?3|g)\]\s*[:=]\s*(.+)/i,
      );
      if (usage) {
        const values = usage[3].split(/[,;]/).map((s) => Number(s.trim()));
        if (values.every((v) => Number.isFinite(v) && v >= 0)) {
          values.forEach((value, i) => {
            statistics.filaments[i] ??= {
              tool: i,
              lengthMm: null,
              volumeCm3: null,
              weightG: null,
            };
            if (usage[2] === "mm") statistics.filaments[i].lengthMm = value;
            else if (usage[2] === "g") statistics.filaments[i].weightG = value;
            else
              statistics.filaments[i].volumeCm3 =
                usage[1]?.toLowerCase() === "volume" &&
                text.includes("BambuStudio 02.08.02.61")
                  ? value / 1000
                  : value;
          });
        }
      }
      const feature = comment.match(/^(?:FEATURE|TYPE):\s*(.+)/);
      if (feature) role = feature[1];
      const w = comment.match(/^(?:LINE_WIDTH|WIDTH):\s*([\d.]+)/);
      if (w && Number(w[1]) > 0) width = Number(w[1]);
      const h = comment.match(/^(?:LAYER_HEIGHT|HEIGHT):\s*([\d.]+)/);
      if (h && Number(h[1]) > 0) height = Number(h[1]);
      if (/^(?:CHANGE_LAYER|LAYER_CHANGE)$/.test(comment)) {
        layer++;
        layerMarker = true;
        layerZ.set(layer, z);
      }
      const zh = comment.match(/^Z_HEIGHT:\s*([-\d.]+)/);
      if (zh) {
        z = Number(zh[1]);
        layerZ.set(layer, z);
      }
    }
    const line = (semicolon >= 0 ? raw.slice(0, semicolon) : raw)
      .replace(/\([^)]*\)/g, "")
      .replace(/^\s*N\d+\s*/i, "")
      .trim()
      .toUpperCase();
    const command = line.match(/^([GMT])\s*(\d+(?:\.\d+)?)/);
    if (!command) continue;
    const cmd = command[1] + String(Number(command[2]));
    if (cmd === "M622") {
      conditional++;
      warnings.add(
        "Se omiten ramas condicionales de calibración M622/M623; comprueba preparación en Bambu Studio.",
      );
      continue;
    }
    if (cmd === "M623") {
      conditional = Math.max(0, conditional - 1);
      continue;
    }
    if (conditional) continue;
    const fields: Record<string, number> = {};
    for (const m of line
      .slice(command[0].length)
      .matchAll(/([A-Z])\s*([-+]?(?:\d+\.?\d*|\.\d+))/g))
      fields[m[1]] = Number(m[2]);
    if (cmd === "G90") {
      absolute = true;
      continue;
    }
    if (cmd === "G91") {
      absolute = false;
      continue;
    }
    if (cmd === "M82") {
      eAbsolute = true;
      continue;
    }
    if (cmd === "M83") {
      eAbsolute = false;
      continue;
    }
    if (cmd === "G20") {
      scale = 25.4;
      continue;
    }
    if (cmd === "G21") {
      scale = 1;
      continue;
    }
    if (["G17", "G18", "G19"].includes(cmd)) {
      plane = cmd;
      if (cmd !== "G17")
        warnings.add(
          `Plano ${cmd} no soportado para arcos; estos se muestran como extremos.`,
        );
      continue;
    }
    if (command[1] === "T") {
      if (Number.isInteger(Number(command[2]))) tool = Number(command[2]);
      continue;
    }
    if (cmd === "G92") {
      for (const [i, axis] of ["X", "Y", "Z"].entries())
        if (fields[axis] !== undefined)
          origin[i] = pos[i] - fields[axis] * scale;
      if (fields.E !== undefined) e = fields.E * scale;
      if (!Object.keys(fields).length) {
        origin = [...pos];
        e = 0;
      }
      continue;
    }
    if (cmd === "G28") {
      warnings.add(
        "El homing G28 de preparación no se representa como trayectoria.",
      );
      continue;
    }
    if (!["G0", "G1", "G2", "G3"].includes(cmd)) {
      if (command[1] === "G" && !["G4", "G29", "G29.1"].includes(cmd))
        warnings.add(`Comando geométrico ${cmd} no representado.`);
      continue;
    }
    if (fields.F !== undefined) feed = fields.F * scale;
    const next = [...pos] as Vec3;
    for (const [i, axis] of ["X", "Y", "Z"].entries())
      if (fields[axis] !== undefined)
        next[i] = fields[axis] * scale + (absolute ? origin[i] : pos[i]);
    const nextE =
        fields.E === undefined
          ? e
          : fields.E * scale + (eAbsolute && absolute ? 0 : e),
      extruding = nextE - e > 1e-7;
    if (!layerMarker && extruding && next[2] > z + 1e-5) {
      z = next[2];
      layer++;
      layerZ.set(layer, z);
    }
    if ((cmd === "G2" || cmd === "G3") && plane === "G17") {
      let cx = pos[0] + (fields.I ?? 0) * scale,
        cy = pos[1] + (fields.J ?? 0) * scale,
        valid = fields.I !== undefined || fields.J !== undefined;
      const direction = cmd === "G2" ? -1 : 1;
      if (!valid && fields.R !== undefined) {
        const dx = next[0] - pos[0],
          dy = next[1] - pos[1],
          chord = Math.hypot(dx, dy),
          radius = Math.abs(fields.R * scale);
        if (chord > 1e-8 && chord <= 2 * radius + 1e-6) {
          const offset =
            Math.sqrt(Math.max(0, radius * radius - (chord * chord) / 4)) *
            (fields.R < 0 ? -direction : direction);
          cx = (pos[0] + next[0]) / 2 - (dy / chord) * offset;
          cy = (pos[1] + next[1]) / 2 + (dx / chord) * offset;
          valid = true;
        }
      }
      const radius = Math.hypot(pos[0] - cx, pos[1] - cy);
      if (
        valid &&
        radius > 1e-8 &&
        Math.abs(Math.hypot(next[0] - cx, next[1] - cy) - radius) <
          Math.max(0.05, radius * 0.01)
      ) {
        const start = Math.atan2(pos[1] - cy, pos[0] - cx),
          end = Math.atan2(next[1] - cy, next[0] - cx);
        let sweep = end - start;
        if (direction > 0) {
          while (sweep <= 1e-8) sweep += Math.PI * 2;
        } else {
          while (sweep >= -1e-8) sweep -= Math.PI * 2;
        }
        const count = Math.ceil((Math.abs(sweep) * radius) / 0.5);
        if (count > 100000) throw Error("Arco demasiado grande");
        let previous = pos;
        for (let i = 1; i <= count; i++) {
          const t = i / count,
            angle = start + sweep * t;
          const point: Vec3 =
            i === count
              ? next
              : [
                  cx + radius * Math.cos(angle),
                  cy + radius * Math.sin(angle),
                  pos[2] + (next[2] - pos[2]) * t,
                ];
          add(previous, point, extruding);
          previous = point;
        }
      } else {
        warnings.add(
          "Arco inválido o no soportado: se muestra una línea entre extremos.",
        );
        add(pos, next, extruding);
      }
    } else add(pos, next, extruding);
    pos = next;
    e = nextE;
  }
  const weights = statistics.filaments.map((f) => f.weightG);
  if (weights.length && weights.every((w) => w !== null))
    statistics.weightG = weights.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const layers = [...layerZ.entries()].map(([index, z]) => {
    let start = segments.findIndex((s) => s.layer === index);
    if (start < 0) start = segments.length;
    let end = start;
    while (end < segments.length && segments[end].layer === index) end++;
    return { index, z, start, end };
  });
  const seams = detectSeams(segments, warnings);
  for (const seam of seams) segments[seam.segmentIndex].seam = seam.position;
  return {
    id: 1,
    name: "Placa 1",
    segments,
    layers,
    statistics,
    warnings: [...warnings],
    seams,
  };
}
