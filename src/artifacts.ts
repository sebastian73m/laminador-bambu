import yauzl from "yauzl";
import { stat } from "node:fs/promises";
import { parseGcode, parseDuration } from "./gcode.js";
import type { SliceResult, PlatePreview } from "./types.js";
export interface ArchiveLimits {
  maxFileBytes?: number;
  maxExpandedBytes?: number;
  maxSegments?: number;
}
async function readArchive(
  path: string,
  limits: ArchiveLimits = {},
): Promise<Map<string, string>> {
  const s = await stat(path);
  if (s.size > (limits.maxFileBytes ?? 256 * 1024 * 1024))
    throw Error("3MF excede el límite de tamaño");
  return new Promise((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true, autoClose: true, validateEntrySizes: true },
      (err, zip) => {
        if (err || !zip) {
          reject(err ?? Error("3MF inválido"));
          return;
        }
        let expanded = 0,
          count = 0,
          done = false;
        const files = new Map<string, string>();
        const fail = (e: unknown) => {
          if (done) return;
          done = true;
          zip.close();
          reject(e);
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (!done) {
            done = true;
            resolve(files);
          }
        });
        zip.on("entry", (entry) => {
          if (++count > 10000) {
            fail(Error("ZIP excede el límite de entradas"));
            return;
          }
          expanded += entry.uncompressedSize;
          if (expanded > (limits.maxExpandedBytes ?? 512 * 1024 * 1024)) {
            fail(Error("ZIP excede el límite de expansión"));
            return;
          }
          if (
            entry.fileName.startsWith("/") ||
            entry.fileName.split("/").includes("..") ||
            entry.generalPurposeBitFlag & 1
          ) {
            fail(Error("ZIP contiene rutas inválidas o entradas cifradas"));
            return;
          }
          const relevant =
            /^Metadata\/(?:plate_\d+\.gcode|slice_info\.config|model_settings\.config|project_settings\.config)$/i.test(
              entry.fileName,
            );
          if (!relevant) {
            zip.readEntry();
            return;
          }
          if (files.has(entry.fileName)) {
            fail(Error("ZIP contiene entradas duplicadas"));
            return;
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              fail(err ?? Error("Entrada ilegible"));
              return;
            }
            const buffers: Buffer[] = [];
            let bytes = 0;
            stream.on("error", fail);
            stream.on("data", (b: Buffer) => {
              bytes += b.length;
              if (
                bytes > entry.uncompressedSize ||
                bytes > (limits.maxExpandedBytes ?? 512 * 1024 * 1024)
              ) {
                stream.destroy(Error("ZIP excede el límite de expansión"));
                return;
              }
              buffers.push(b);
            });
            stream.on("end", () => {
              if (done) return;
              files.set(
                entry.fileName,
                Buffer.concat(buffers).toString("utf8"),
              );
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g))
    result[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, "&");
  return result;
}
function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function enrich(plates: PlatePreview[], xml: string) {
  for (const block of xml.matchAll(/<plate\b[^>]*>([\s\S]*?)<\/plate>/g)) {
    const meta: Record<string, string> = {};
    for (const tag of block[1].matchAll(/<metadata\b[^>]*\/?\s*>/g)) {
      const a = attributes(tag[0]);
      if (a.key) meta[a.key] = a.value;
    }
    const p = plates.find((p) => p.id === Number(meta.index));
    if (!p) continue;
    const seconds = parseDuration(meta.prediction ?? "");
    if (seconds !== null) p.statistics.totalSeconds = seconds;
    const weight = num(meta.weight);
    if (weight !== null) p.statistics.weightG = weight;
    const filamentTags = [...block[1].matchAll(/<filament\b[^>]*\/?\s*>/g)];
    for (const tag of filamentTags) {
      const a = attributes(tag[0]),
        tool = Number(a.id) - 1;
      if (!Number.isInteger(tool) || tool < 0) continue;
      let f = p.statistics.filaments.find((f) => f.tool === tool);
      if (!f) {
        f = { tool, lengthMm: null, volumeCm3: null, weightG: null };
        p.statistics.filaments.push(f);
      }
      const m = num(a.used_m),
        g = num(a.used_g);
      if (m !== null && f.lengthMm === null) f.lengthMm = m * 1000;
      if (g !== null) f.weightG = g;
      f.type = a.type;
      f.color = a.color;
    }
    for (const tag of block[1].matchAll(/<warning\b[^>]*\/?\s*>/g)) {
      const a = attributes(tag[0]);
      if (a.msg) p.warnings.push(a.msg);
    }
    p.statistics.source = "Bambu Studio";
  }
}
export async function inspectArchive(path: string, limits: ArchiveLimits = {}) {
  const files = await readArchive(path, limits);
  const slicedPlates = [...files.keys()]
    .flatMap((k) => {
      const m = k.match(/^Metadata\/plate_(\d+)\.gcode$/i);
      return m ? [Number(m[1])] : [];
    })
    .sort((a, b) => a - b);
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(
      files.get("Metadata/project_settings.config") ?? "{}",
    );
  } catch {}
  return {
    slicedPlates,
    hasProjectSettings: files.has("Metadata/project_settings.config"),
    printerModel:
      typeof settings.printer_model === "string"
        ? settings.printer_model
        : null,
    metadataFiles: [...files.keys()].filter((k) => !k.endsWith(".gcode")),
  };
}
export async function loadSlice(
  path: string,
  limits: ArchiveLimits = {},
): Promise<SliceResult> {
  const files = await readArchive(path, limits),
    plates: PlatePreview[] = [];
  for (const [name, text] of files) {
    const m = name.match(/^Metadata\/plate_(\d+)\.gcode$/i);
    if (!m) continue;
    const p = parseGcode(text, limits.maxSegments);
    p.id = Number(m[1]);
    p.name = `Placa ${p.id}`;
    plates.push(p);
  }
  if (!plates.length)
    throw Error(
      "El 3MF no contiene G-code laminado. Ejecuta slice_project primero.",
    );
  plates.sort((a, b) => a.id - b.id);
  enrich(plates, files.get("Metadata/slice_info.config") ?? "");
  return { plates, warnings: [] };
}
