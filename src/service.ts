import { readdir, readFile, stat, open } from "node:fs/promises";
import { join, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { createImporter } from "./imports.js";
import { JobManager } from "./jobs.js";
import { probeEngine, resolveProject } from "./engine.js";
import { inspectArchive, loadSlice } from "./artifacts.js";
import { makeDemo } from "./demo.js";
import {
  summarizePlate,
  type Config,
  type SliceInput,
  type SliceResult,
} from "./types.js";
export function createService(config: Config) {
  const jobs = new JobManager(config);
  const previews = new Map<string, SliceResult>();
  const cacheKeys = new Map<string, string>();
  const limits = {
    maxFileBytes: config.maxFileBytes,
    maxExpandedBytes: config.maxExpandedBytes,
    maxSegments: config.maxSegments,
  };
  const remember = (data: SliceResult, key?: string) => {
    if (previews.size >= 3) {
      const oldest = previews.keys().next().value!;
      previews.delete(oldest);
      for (const [k, v] of cacheKeys) if (v === oldest) cacheKeys.delete(k);
    }
    const id = randomUUID();
    previews.set(id, data);
    if (key) cacheKeys.set(key, id);
    return id;
  };
  const preview = (id: string) => {
    const p = previews.get(id);
    if (!p)
      throw Error(
        "Vista previa no encontrada o caducada; vuelve a abrir el proyecto",
      );
    return p;
  };
  return {
    config,
    jobs,
    ...createImporter(config),
    engineStatus: () => probeEngine(config.engine),
    async listProjects() {
      const result: string[] = [];
      async function walk(dir: string, depth: number) {
        if (depth > 5) return;
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (result.length >= 500) return;
          const path = join(dir, entry.name);
          if (entry.isDirectory()) await walk(path, depth + 1);
          else if (entry.isFile() && entry.name.toLowerCase().endsWith(".3mf"))
            result.push(relative(config.projects, path).replaceAll("\\", "/"));
        }
      }
      await walk(config.projects, 0);
      return { projects: result.sort() };
    },
    async inspectProject(project: string) {
      const path = await resolveProject(
        config.projects,
        project,
        config.maxFileBytes,
      );
      return { project, ...(await inspectArchive(path, limits)) };
    },
    async sliceProject(input: SliceInput) {
      await this.inspectProject(input.project);
      const result = await jobs.start(input);
      return publicJob(result);
    },
    jobStatus: (id: string) => publicJob(jobs.get(id)),
    async cancelJob(id: string) {
      return publicJob(await jobs.cancel(id));
    },
    async openPreview(input: {
      project?: string;
      jobId?: string;
      demo?: boolean;
    }) {
      let id: string | undefined, key: string | undefined;
      if (input.demo) {
        key = "demo";
      } else if (input.jobId) {
        const job = jobs.get(input.jobId);
        if (job.state !== "completed" || !job.output)
          throw Error("El laminado aún no terminó correctamente");
        key = `job:${job.id}`;
      } else if (input.project) {
        key = `project:${input.project}`;
      } else throw Error("Indica project o jobId");
      // Existing projects may be edited outside the service: never reuse their cache.
      if (!input.project) id = cacheKeys.get(key);
      if (!id) {
        let data: SliceResult;
        if (input.demo) data = makeDemo();
        else {
          const path = input.jobId
            ? jobs.get(input.jobId).output!
            : await resolveProject(
                config.projects,
                input.project!,
                config.maxFileBytes,
              );
          data = await loadSlice(path, limits);
        }
        id = remember(data, input.project ? undefined : key);
      }
      const data = preview(id);
      return {
        previewId: id,
        jobId: input.jobId ?? null,
        demo: !!input.demo,
        plates: data.plates.map(summarizePlate),
        warnings: data.warnings,
      };
    },
    getToolpathChunk(input: {
      previewId: string;
      plate: number;
      offset: number;
      limit: number;
    }) {
      if (
        !Number.isInteger(input.offset) ||
        input.offset < 0 ||
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 4000
      )
        throw Error("Bloque de trayectorias inválido");
      const plate = preview(input.previewId).plates.find(
        (p) => p.id === input.plate,
      );
      if (!plate) throw Error("Placa no encontrada");
      if (input.offset > plate.segments.length)
        throw Error("Offset fuera de rango");
      const end = Math.min(input.offset + input.limit, plate.segments.length);
      return {
        segments: plate.segments.slice(input.offset, end),
        nextOffset: end < plate.segments.length ? end : null,
        total: plate.segments.length,
      };
    },
    async getResultChunk(input: {
      jobId: string;
      offset: number;
      limit: number;
    }) {
      if (
        !Number.isInteger(input.offset) ||
        input.offset < 0 ||
        !Number.isInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 262144
      )
        throw Error("Bloque de archivo inválido");
      const job = jobs.get(input.jobId);
      if (!job.output || job.state !== "completed")
        throw Error("Resultado no disponible");
      const size = (await stat(job.output)).size;
      if (input.offset > size) throw Error("Offset fuera de rango");
      const file = await open(job.output, "r");
      try {
        const buffer = Buffer.alloc(Math.min(input.limit, size - input.offset));
        const { bytesRead } = await file.read(
          buffer,
          0,
          buffer.length,
          input.offset,
        );
        return {
          base64: buffer.subarray(0, bytesRead).toString("base64"),
          nextOffset:
            input.offset + bytesRead < size ? input.offset + bytesRead : null,
          total: size,
        };
      } finally {
        await file.close();
      }
    },
  };
}
function publicJob(job: ReturnType<JobManager["get"]>) {
  const { output, ...rest } = job;
  return { ...rest, hasResult: !!output };
}
export type Service = ReturnType<typeof createService>;
