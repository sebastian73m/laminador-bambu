import { realpath, stat, mkdtemp, rm } from "node:fs/promises";
import { dirname, basename, resolve, relative, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { SliceInput } from "./types.js";
export async function resolveAllowed(
  root: string,
  path: string,
  extension: string,
  maxBytes = 256 * 1024 * 1024,
): Promise<string> {
  if (isAbsolute(path) || path.includes("\0"))
    throw Error("Usa una ruta relativa a la carpeta de proyectos");
  if (!path.toLowerCase().endsWith(extension))
    throw Error(`Se requiere un archivo ${extension.toUpperCase()}`);
  const base = await realpath(root),
    target = await realpath(resolve(base, path)),
    rel = relative(base, target);
  if (
    rel === ".." ||
    rel.startsWith("../") ||
    rel.startsWith("..\\") ||
    isAbsolute(rel)
  )
    throw Error("El archivo está fuera de la carpeta autorizada");
  const s = await stat(target);
  if (!s.isFile() || s.size > maxBytes)
    throw Error("Archivo inválido o demasiado grande");
  return target;
}
export async function resolveProject(
  root: string,
  path: string,
  maxBytes?: number,
) {
  return resolveAllowed(root, path, ".3mf", maxBytes);
}
export function makeSliceArgs(
  input: string,
  output: string,
  plate: number,
  profiles?: { machine?: string; process?: string; filaments?: string[] },
): string[] {
  if (!Number.isInteger(plate) || plate < 0 || plate > 100)
    throw Error("Placa inválida");
  const args = [
    "--slice",
    String(plate),
    "--debug",
    "2",
    "--outputdir",
    dirname(output),
    "--export-3mf",
    basename(output),
  ];
  const settings = [profiles?.machine, profiles?.process].filter(Boolean);
  if (settings.length) args.push("--load-settings", settings.join(";"));
  if (profiles?.filaments?.length)
    args.push("--load-filaments", profiles.filaments.join(";"));
  args.push(input);
  return args;
}
export async function resolveProfiles(root: string, input: SliceInput) {
  const machine = input.machine
    ? await resolveAllowed(root, input.machine, ".json")
    : undefined;
  const process = input.process
    ? await resolveAllowed(root, input.process, ".json")
    : undefined;
  const filaments = input.filaments
    ? await Promise.all(
        input.filaments.map((p) => resolveAllowed(root, p, ".json")),
      )
    : undefined;
  for (const p of [machine, process, ...(filaments ?? [])])
    if (p?.includes(";"))
      throw Error("Los perfiles no pueden contener punto y coma en la ruta");
  return { machine, process, filaments };
}
export async function killTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((r) => {
      const p = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      p.once("close", () => r());
      p.once("error", () => r());
    });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
    try {
      process.kill(-pid, "SIGKILL");
    } catch {}
  }
}
export async function probeEngine(path: string): Promise<{
  available: boolean;
  path: string;
  message: string;
  cli?: boolean;
}> {
  if (!path)
    return {
      available: false,
      path,
      message: "Configura BAMBU_STUDIO_PATH con el binario de Bambu Studio",
    };
  try {
    const s = await stat(path);
    if (!s.isFile()) throw Error("not file");
  } catch {
    return {
      available: false,
      path,
      message: "No se encuentra el binario configurado",
    };
  }
  const probeDir = await mkdtemp(join(tmpdir(), "bambu-probe-"));
  return new Promise((resolveStatus) => {
    let output = "",
      done = false;
    const child = spawn(resolve(path), ["--help"], {
      cwd: probeDir,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    const finish = (available: boolean, message: string, cli = false) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void rm(probeDir, { recursive: true, force: true })
        .catch(() => {})
        .finally(() => resolveStatus({ available, path, message, cli }));
    };
    const timer = setTimeout(async () => {
      if (child.pid) await killTree(child.pid);
      finish(false, "El motor no respondió a --help en 10 segundos");
    }, 10000);
    for (const s of [child.stdout, child.stderr])
      s.on("data", (b) => {
        output = (output + b.toString()).slice(-32000);
      });
    child.on("error", (e) => finish(false, e.message));
    child.on("close", (code) => {
      const cli = output.includes("--slice") && output.includes("--export-3mf");
      finish(
        code === 0 && cli,
        cli
          ? "CLI de Bambu Studio disponible"
          : `CLI no disponible: ${output.slice(-2000)}`,
        cli,
      );
    });
  });
}
