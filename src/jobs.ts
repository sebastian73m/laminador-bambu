import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, access, cp } from "node:fs/promises";
import { join } from "node:path";
import {
  makeSliceArgs,
  resolveProject,
  resolveProfiles,
  killTree,
} from "./engine.js";
import type { Config, SliceInput, JobSummary } from "./types.js";
interface Entry {
  summary: JobSummary;
  pid?: number;
  stopReason?: string;
  exit?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
}
export class JobManager {
  private entries = new Map<string, Entry>();
  private starting = 0;
  constructor(
    readonly config: Config,
    private argsFactory = makeSliceArgs,
  ) {}
  get(id: string): JobSummary {
    const e = this.entries.get(id);
    if (!e) throw Error("Trabajo no encontrado");
    return { ...e.summary };
  }
  async start(input: SliceInput): Promise<JobSummary> {
    const active = [...this.entries.values()].filter(
      (e) => e.summary.state === "running" || e.summary.state === "queued",
    ).length;
    if (active + this.starting >= this.config.maxConcurrent)
      throw Error("Ya hay un laminado en curso");
    if (this.entries.size >= this.config.maxJobs)
      throw Error(
        "Límite de trabajos alcanzado. Reinicia el servicio después de guardar los resultados y limpia JOBS_DIR",
      );
    if (!this.config.engine) throw Error("Configura BAMBU_STUDIO_PATH");
    this.starting++;
    try {
      const source = await resolveProject(
        this.config.projects,
        input.project,
        this.config.maxFileBytes,
      );
      const profiles = await resolveProfiles(this.config.projects, input);
      await mkdir(this.config.jobs, { recursive: true });
      const id = randomUUID(),
        dir = join(this.config.jobs, id);
      await mkdir(dir);
      const copy = join(dir, "input.3mf");
      await cp(source, copy);
      const output = join(dir, "result.3mf");
      const args = this.argsFactory(copy, output, input.plate, profiles);
      const summary: JobSummary = {
        id,
        state: "queued",
        project: input.project,
        plate: input.plate,
        createdAt: new Date().toISOString(),
        message: "Iniciando motor",
        log: "",
      };
      const entry: Entry = { summary };
      this.entries.set(id, entry);
      const child = spawn(this.config.engine, args, {
        cwd: dir,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
      entry.pid = child.pid;
      summary.state = "running";
      summary.message = "Laminando con Bambu Studio";
      for (const stream of [child.stdout, child.stderr])
        stream.on("data", (buffer) => {
          summary.log = (summary.log + buffer.toString()).slice(-16000);
        });
      entry.exit = new Promise<void>((resolve) => {
        child.once("error", (e) => {
          clearTimeout(entry.timer);
          summary.state = "failed";
          summary.message = e.message;
          resolve();
        });
        child.once("close", async (code) => {
          clearTimeout(entry.timer);
          entry.pid = undefined;
          if (entry.stopReason) {
            summary.state =
              entry.stopReason === "cancelled" ? "cancelled" : "failed";
            summary.message =
              entry.stopReason === "cancelled"
                ? "Laminado cancelado"
                : "Se excedió el tiempo máximo de laminado";
          } else if (code !== 0) {
            summary.state = "failed";
            summary.message = `Bambu Studio terminó con código ${code}. ${summary.log.slice(-3000)}`;
          } else {
            try {
              await access(output);
              summary.state = "completed";
              summary.message = "Laminado terminado";
              summary.output = output;
            } catch {
              summary.state = "failed";
              summary.message = "El motor no produjo result.3mf";
            }
          }
          resolve();
        });
      });
      entry.timer = setTimeout(() => {
        entry.stopReason = "timeout";
        if (entry.pid) void killTree(entry.pid);
      }, this.config.timeoutMs);
      return { ...summary };
    } finally {
      this.starting--;
    }
  }
  async cancel(id: string): Promise<JobSummary> {
    const e = this.entries.get(id);
    if (!e) throw Error("Trabajo no encontrado");
    if (e.summary.state === "running" || e.summary.state === "queued") {
      e.stopReason = "cancelled";
      if (e.pid) await killTree(e.pid);
      await e.exit;
    }
    return this.get(id);
  }
  async shutdown() {
    await Promise.all([...this.entries.keys()].map((id) => this.cancel(id)));
  }
}
