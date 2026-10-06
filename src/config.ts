import { resolve } from "node:path";
import type { Config } from "./types.js";
function limit(name: string, fallback: number) {
  const v = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(v) || v < 1)
    throw Error(`${name} debe ser un entero positivo`);
  return v;
}
export function readConfig(): Config {
  return {
    engine: process.env.BAMBU_STUDIO_PATH ?? "",
    projects: resolve(process.env.PROJECTS_DIR ?? "projects"),
    jobs: resolve(process.env.JOBS_DIR ?? ".jobs"),
    timeoutMs: limit("SLICE_TIMEOUT_MS", 1800000),
    maxConcurrent: limit("MAX_CONCURRENT_JOBS", 1),
    maxSegments: limit("MAX_SEGMENTS", 2000000),
    maxFileBytes: limit("MAX_FILE_BYTES", 256 * 1024 * 1024),
    maxExpandedBytes: limit("MAX_EXPANDED_BYTES", 512 * 1024 * 1024),
    maxJobs: limit("MAX_JOBS", 20),
  };
}
