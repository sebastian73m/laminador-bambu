import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execute = promisify(execFile);
export const dockerCommand =
  process.platform === "win32" ? "docker.exe" : "docker";
export async function docker(args, options = {}) {
  try {
    return (
      await execute(dockerCommand, args, {
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024,
        ...options,
      })
    ).stdout;
  } catch (error) {
    throw Error(
      `Docker ${args[0]} falló. Inicia Docker Desktop/daemon y comprueba PATH, contexto y permisos.\n${error.stderr || error.message}`,
    );
  }
}
export function validateContainer(info) {
  if (!info.State.Running) throw Error("El contenedor no está iniciado");
  if (info.State.Health?.Status !== "healthy")
    throw Error(
      `Contenedor no healthy: ${info.State.Health?.Status ?? "sin healthcheck"}`,
    );
  if (info.Config.User !== "laminador")
    throw Error("Se esperaba el usuario sin privilegios laminador");
  const ports = info.NetworkSettings.Ports["4319/tcp"] ?? [];
  if (
    ports.length !== 1 ||
    ports[0].HostIp !== "127.0.0.1" ||
    ports[0].HostPort !== "4319"
  )
    throw Error(
      "El puerto debe publicarse únicamente como 127.0.0.1:4319:4319",
    );
  if (
    !info.HostConfig.CapDrop?.includes("ALL") ||
    !info.HostConfig.SecurityOpt?.includes("no-new-privileges:true")
  )
    throw Error("Faltan cap_drop ALL o no-new-privileges");
  if (info.Mounts.some((mount) => mount.Destination === "/var/run/docker.sock"))
    throw Error("El socket Docker no debe montarse en el contenedor");
  return {
    running: true,
    health: "healthy",
    user: info.Config.User,
    published: "127.0.0.1:4319",
    mounts: info.Mounts.map((m) => ({
      type: m.Type,
      destination: m.Destination,
    })),
  };
}
